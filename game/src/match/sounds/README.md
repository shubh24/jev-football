# Match sound sources

The local game uses 19 free MP3 recordings from Mixkit, about 6 MB and 196 seconds in total.
The background recordings repeat with fades. Chants, field sounds, and crowd reactions use separate tracks.
The game selects different clips from each group and limits repeated reactions.

- Source pages: https://mixkit.co/free-sound-effects/soccer/ and https://mixkit.co/free-sound-effects/sports/
- License: https://mixkit.co/license/modal/sfxFree/
- File list, download URLs, durations, sizes, and SHA-256 checksums: `manifest.json`
- The downloaded MP3s are the public MP3 versions provided by the sound cards on those pages.
- The license permits use in games. It prohibits distribution as standalone sound assets or with source files.
  MP3 files are therefore excluded from git. Keep them as local game assets. Check the license before packaging a release.
- Restore local files with `python3 scripts/download-match-audio.py` from the game directory.

No paid packs or extracted FIFA recordings are included.
The metal post sound uses short generated tones.
Optional English commentary uses an installed device voice, selected through the browser.
It does not download voice packs or call a cloud speech service. Voice availability depends on the device.

Audio starts from the Start Match button. Open Stadium Sound for mute, volume, and commentary controls.
Pause and reset stop current clips and speech. Sound failures do not stop the match.
JEV chooses player actions. A local sound director responds to completed physics events, possession changes,
and distance to the attacking goal. Sound never changes game state or waits for JEV.
