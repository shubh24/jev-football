// Player names checked against EA's current Argentina and Spain ratings pages.
// This is a prototype 4–4–2 selection, not a copy of an official starting eleven.
// Shirt numbers are fixed for this prototype.
export const TEAMS=[
  {name:'Argentina',code:'ARG',controller:'You',color:'#f4f7fb',stripe:'#75bce5',shorts:'#152436',socks:'#f4f7fb',ink:'#122235',keeper:'#5bbb8a',map:'#a8dfff',players:[
    ['Emiliano Martínez','E. Martínez',23],['Nicolás Tagliafico','Tagliafico',3],
    ['Cristian Romero','Romero',13],['Nicolás Otamendi','Otamendi',19],
    ['Nahuel Molina','Molina',26],['Nicolás González','N. González',15],
    ['Enzo Fernández','Enzo Fernández',24],['Rodrigo De Paul','De Paul',7],
    ['Lionel Messi','Messi',10],['Julián Álvarez','J. Álvarez',9],
    ['Lautaro Martínez','Lautaro',22],
  ]},
  {name:'Spain',code:'ESP',controller:'JEV',color:'#ce2336',shorts:'#142c53',socks:'#ce2336',ink:'#ffdc70',keeper:'#eac34e',map:'#fa5b69',players:[
    ['Unai Simón','Unai Simón',23],['Marc Cucurella','Cucurella',24],
    ['Robin Le Normand','Le Normand',3],['Dean Huijsen','Huijsen',12],
    ['Pedro Porro','Pedro Porro',2],['Nico Williams','Nico Williams',17],
    ['Rodri','Rodri',16],['Pedri','Pedri',20],['Lamine Yamal','Lamine Yamal',19],
    ['Mikel Oyarzabal','Oyarzabal',21],['Ferran Torres','Ferran Torres',11],
  ]},
];
export function playerIdentity(team,index){
  const [name,shortName,number]=TEAMS[team].players[index];
  return {name,shortName,number};
}
export function playerName(id){
  const match=/^([hj])(\d+)$/i.exec(id||'');
  const player=match&&TEAMS[match[1].toLowerCase()==='j'?1:0].players[Number(match[2])-1];
  return player?.[1]||id;
}
export function namedText(text=''){
  return text.replace(/\b[HJ](?:1[01]|[1-9])\b/gi,id=>playerName(id));
}
export function playerKit(player){
  const team=TEAMS[player.team],identity=playerIdentity(player.team,player.index),keeper=player.role==='GK';
  return {...team,color:keeper?team.keeper:team.color,stripe:keeper?null:team.stripe,
    shorts:keeper?team.keeper:team.shorts,socks:keeper?team.keeper:team.socks,
    name:identity.shortName.toUpperCase(),number:String(identity.number),ink:keeper?'#122235':team.ink};
}
