"""Small live API timing test. Sends synthetic football data only.

Run explicitly with: python3 benchmark.py --live
Loads only JEV_API_KEY from the user-specified file. Never prints the key.
This measures request time and response shape, not football ability.
"""
import argparse
import datetime
import http.client
import json
from pathlib import Path
import random
import re
import statistics
import time


def read_key():
    path = Path.home() / "projects/sales-engine/.env"
    for line in path.read_text().splitlines():
        match = re.match(r"^\s*(?:export\s+)?JEV_API_KEY\s*=\s*(.*?)\s*$", line)
        if match:
            value = match.group(1)
            if value.startswith(('"', "'")):
                value = value[1:value.index(value[0], 1)]
            else:
                value = value.split(" #", 1)[0].strip()
            if value:
                return value
    raise ValueError("JEV_API_KEY is missing or empty")


FORMATION = [(5, 34), (25, 10), (25, 26), (25, 42), (25, 58),
             (48, 10), (48, 26), (48, 42), (48, 58), (73, 25), (73, 43)]
DIRECTIONS = {
    "hold": "Do not move", "east": "Move +x", "west": "Move -x",
    "north": "Move -y", "south": "Move +y",
    "northeast": "Move +x and -y", "northwest": "Move -x and -y",
    "southeast": "Move +x and +y", "southwest": "Move -x and +y",
}


def state_for(index):
    rng = random.Random(index)
    players = []
    for team in ("jev", "human"):
        for i, (x, y) in enumerate(FORMATION):
            players.append({"id": f"{team}_{i}", "team": team,
                            "role": "goalkeeper" if i == 0 else "outfield",
                            "position": [round((x if team == "jev" else 105-x) + rng.uniform(-1, 1), 2), y],
                            "velocity": [0, 0], "stamina": 0.9,
                            "action": "idle", "cooldown_s": 0})
    owner = players[9]
    return {"state_id": index, "time_s": round(10 + index * 0.1, 1),
            "units": "metres, seconds", "pitch": [105, 68],
            "jev_attacks": "+x", "human_attacks": "-x",
            "score": [0, 0], "phase": "open_play",
            "ball": {"position": owner["position"] + [0.11], "velocity": [0, 0, 0], "owner": owner["id"]},
            "rules": "Choose actions for the next 100ms. Only the ball owner can pass or shoot. Tackle only within 1.5m of an opponent with the ball. Players can move and act together. Keep team spacing and defend your own goal.",
            "players": players}


def questions_for(count):
    questions = {}
    ids = [9] if count == 1 else range(11)
    for i in ids:
        player = f"jev_{i}"
        questions[f"{player}_move"] = {
            "type": "choice", "instructions": f"Which movement direction should player {player} use now to help the Jev team? Consider this player's role and the other players' current positions.",
            "criteria": DIRECTIONS,
        }
        if count == 33:
            criteria = ({"none": "No special action", "dive_north": "Dive towards -y to save the ball", "dive_south": "Dive towards +y to save the ball", "catch": "Catch a reachable incoming ball"}
                        if i == 0 else {"none": "No special action", "pass": "Pass to a teammate", "shoot": "Shoot at the opposing goal", "tackle": "Tackle a nearby ball carrier", "defend": "Take a defensive stance"})
            questions[f"{player}_action"] = {"type": "choice", "instructions": f"Which legal special action should player {player} take now? Select none if no special action helps.", "criteria": criteria}
            questions[f"{player}_sprint"] = {"type": "noul", "instructions": f"Should player {player} sprint now, considering position and stamina?"}
    assert len(questions) == count
    return questions


def validate(data, questions):
    answers = data.get("answers", {})
    if set(answers) != set(questions):
        return False
    for name, question in questions.items():
        answer = answers[name]
        if answer.get("type") != question["type"]:
            return False
        if question["type"] == "choice":
            probs = answer.get("probabilities", {})
            if answer.get("choice") not in question["criteria"] or set(probs) != set(question["criteria"]):
                return False
            if not all(isinstance(p, (float, int)) and 0 <= p <= 1 for p in probs.values()):
                return False
            if abs(sum(probs.values()) - 1) > 0.01:
                return False
        elif not isinstance(answer.get("noul"), (int, float)) or not 0 <= answer["noul"] <= 1:
            return False
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--live", action="store_true")
    args = parser.parse_args()
    if not args.live:
        parser.error("Use --live to authorize this bounded run of 26 API requests.")
    key = read_key()
    conn = http.client.HTTPSConnection("api.typesafe.ai", timeout=15)
    records = []
    order = [1, 33]
    rng = random.Random(42)
    for _ in range(8):
        batch = [1, 11, 33]
        rng.shuffle(batch)
        order.extend(batch)
    model = "jev-latest"
    for index, count in enumerate(order):
        questions = questions_for(count)
        body = json.dumps({"model": model, "state": state_for(index), "questions": questions}, separators=(",", ":"))
        start = time.perf_counter()
        try:
            conn.request("POST", "/v1/systemone", body=body,
                         headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})
            response = conn.getresponse()
            raw = response.read()
            if response.status != 200:
                print(json.dumps({"error": "HTTP request failed", "status": response.status}), flush=True)
                break
            data = json.loads(raw)
            elapsed = (time.perf_counter() - start) * 1000
            model = data["model"]
            record = {"index": index, "warmup": index < 2, "questions": count,
                      "elapsed_ms": round(elapsed, 2), "request_bytes": len(body.encode()),
                      "response_bytes": len(raw), "model": model,
                      "valid_shape": validate(data, questions), "usage": data.get("usage", {}),
                      "answers": data.get("answers", {})}
            records.append(record)
            print(json.dumps({k: v for k, v in record.items() if k != "answers"}), flush=True)
        except Exception as exc:
            print(json.dumps({"error_type": type(exc).__name__}), flush=True)
            break
    conn.close()
    summary = {}
    for count in (1, 11, 33):
        values = sorted(r["elapsed_ms"] for r in records if not r["warmup"] and r["questions"] == count)
        if values:
            summary[str(count)] = {"samples": len(values), "median_ms": round(statistics.median(values), 2),
                                   "min_ms": min(values), "max_ms": max(values),
                                   "within_100ms": sum(v <= 100 for v in values)}
    output = {"created_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "method": "Sequential HTTPS requests with a reused connection; two warmups excluded. Eight interleaved samples per question count. Synthetic 22-player states with small position changes. Time includes full response transfer and JSON decoding. No retries.",
              "limitations": "Small timing and schema test only. No simulated match, sustained 10Hz load, pass targets, shot direction/power, or coordination/skill validation.",
              "summary": summary, "records": records,
              "example_request_without_credentials": {"model": model, "state": state_for(0), "questions": questions_for(33)}}
    path = Path(__file__).with_name("benchmark-results.json")
    path.write_text(json.dumps(output, indent=2) + "\n")
    print(json.dumps({"summary": summary, "results": str(path)}), flush=True)
    return 0 if len(records) == 26 and all(r["valid_shape"] for r in records) else 1


if __name__ == "__main__":
    raise SystemExit(main())
