const sha1 = require('js-sha1');
const udp = require('dgram');

var tracker;
var server;

function crearTracker() {
  let config = require("./inicialConfig.json");

  let range = setStaticRange(config); //deberían comenzar por el nodo 1

  tracker = {
    ant: config.direcciones.ant,
    sig: config.direcciones.sig,
    min_range: range.partition_begin,
    max_range: range.partition_end,
    //diccionario: new Map(),
    diccionario: [],
    id: config.id,
    host: config.host,
    port: config.port,
    server: server
  };

  createTrackerServer(config);
}

function createTrackerServer(config) {
  server = udp.createSocket('udp4');

  server.on('message', function (msg, info) {
    const remoteAddress = info.address;
    const remotePort = info.port;

    //FUNCION STORE
    /*
    let obj = JSON.parse(msg);
    let hash = obj.body.id;
    let index = parseInt(hash.slice(0, 2), 16);
    if (obj.route.indexOf('store') != -1 && ((tracker.min_range <= index) && (tracker.max_range >= index))) {
      let filename = obj.body.filename;
      let filesize = obj.body.filesize;
      let peers = { host: obj.body.parIP, port: obj.body.parPort };
      storeLocal(filename, filesize, peers);
      console.log(Object.fromEntries((tracker.diccionario[156]).entries())); //BORRAR
      //server.send('Stored succesfull in node ' + config.id, remotePort, remoteAddress);
    }*/
    let obj = JSON.parse(msg);
    if (obj.route.indexOf('store') != -1){
      store(msg);
    }
    if (obj.route.indexOf('scan') != -1){
      scan(msg);
    }
    if (obj.route.indexOf('count') != -1){
      count(msg);
    }
    if (obj.route.indexOf('join') != -1){
      //joinEvaluation(msg);
      console.log(obj);
    }
    if (obj.route.length == 46){ //longitud exacta de cualquier ruta del tipo file/{hash}
      search(msg);
    }
    //server.send('Stored succesfull in node ' + config.id, remotePort, remoteAddress);
  });

  server.on('listening', function () {
    console.log("Tracker " + config.id + " is listening requests.");
  });

  server.bind(config.port);
}

/*function sendData(msg, port, adress){
  server.send(msg, port, adress);
}*/

function setStaticRange(config) {
  let cantNodos = config.cantNodos;
  let partitionSize = Math.floor(256 / cantNodos);
  let partition_begin = partitionSize * (config.id - 1);
  let partition_end = partitionSize + partition_begin;
  if (cantNodos == config.id)
    partition_end += 256 % cantNodos - 1;
  let range = {
    partition_begin: partition_begin,
    partition_end: partition_end
  };
  return range;
}

function search(msg) {
  let obj = JSON.parse(msg);
  let hash = obj.route.slice(6); //obtiene el hash de la ruta
  let index = parseInt(hash.slice(0, 2), 16);
  if ((tracker.min_range <= index) && (tracker.max_range >= index)) {
    let arrayoffiles = tracker.diccionario[index];
    let indexedfile = arrayoffiles.filter(function (fileinfo) { //filtra si existe un archivo con el mismo hash
      return fileinfo.hash == hash;
    });
    let peers = indexedfile[0].peers;
    found(msg, hash, peers);
  } else {
    server.send(msg, tracker.sig.port, tracker.sig.host);
  }
}

function found(msg, hash, peers){
  let obj = JSON.parse(msg);
  let response = {
    messageId: obj.messageId,
    route: `/file/${hash}/found`,
    originIP: obj.originIP,
    originPort: obj.originPort,
    body: {
        id: hash,
        trackerIP: tracker.host,
        trackerPort: tracker.port,
        pares: peers
    }
  }
  server.send(JSON.stringify(response), obj.originPort, obj.originIP); //Envia lo encontrado al servidor
  //console.log(response);
  //console.log(response.body);
}

function scan(msg) {
  let obj = JSON.parse(msg);
  let response = { ...obj };
  if(response.messageId == `scanId=${tracker.id}`) {  //ya se completo el recorrido de todos los trackers
    server.send(JSON.stringify(response), response.originPort, response.originIP);
  }
  else {
    if(response.messageId.length<=7){ //es el primer tracker que se marcara para recorrer todos los nodos scaneando
      response.messageId = `scanId=${tracker.id}`;
    }
    let files = obj.body.files;
    for (let index=tracker.min_range; index<=tracker.max_range; index++){ //añado todos los archivos guardados en este dominio
      let arrayoffiles = tracker.diccionario[index];
      if(!(typeof arrayoffiles === 'undefined')) {
        arrayoffiles.forEach(element => {
          files.push({
            id: element.hash,
            filename: element.filename,
            filesize: element.filesize
          });
        });
      }
    }
    response.body.files =  files;
    server.send(JSON.stringify(response), tracker.sig.port, tracker.sig.host);
  }
}

function store(msg) {
  let obj = JSON.parse(msg);
  let hash = obj.body.id; //se supone que ya viene el hash en el mensaje
  let index = parseInt(hash.slice(0, 2), 16);
  if ((tracker.min_range <= index) && (tracker.max_range >= index)) {
    let filename = obj.body.filename;
    let filesize = obj.body.filesize;
    let peer = { host: obj.body.parIP, port: obj.body.parPort };
    if (tracker.diccionario[index] == null) { //el dominio con ese indice se encuentra sin utilizar
        tracker.diccionario[index] = [{
          hash: hash,
          filename: filename,
          filesize: filesize,
          peers: [peer] //objeto que contiene los pares que tienen el archivo
          }
        ]  //VECTOR
    }
    else {
      let arrayoffiles = tracker.diccionario[index];
      let indexedfile = arrayoffiles.filter(function (fileinfo) {
        return fileinfo.hash == hash;
      });
      if(indexedfile.length>0){  //ya existe un archivo con el hash correspondiente
        indexedfile[0].peers.push(peer);
      } else {  //no existe un archivo con el hash correspondiente
        arrayoffiles.push({
          hash: hash,
          filename: filename,
          filesize: filesize,
          peers: [peer] //objeto que contiene los pares que tienen el archivo
          }
        );
      }

      //REVISAR
      //https://code.tutsplus.com/es/tutorials/how-to-use-map-filter-reduce-in-javascript--cms-26209


      //tracker.diccionario[index] = new Map(Object.entries({mapobject}));
    }
    //BORRAR
    //console.log(Object.fromEntries((tracker.diccionario[254]).entries()));
    //console.log(tracker.diccionario[254][0]);
    //console.log(tracker.diccionario[254][1]);
  }
  else if ((tracker.sig.port != null) && (tracker.sig.host != null)) {
    server.send(msg, tracker.sig.port, tracker.sig.host);
  }
}

function count(msg) {
  let obj = JSON.parse(msg);
  let response = { ...obj };
  if(response.messageId == `countId=${tracker.id}`) {  //ya se completo el recorrido de todos los trackers
    server.send(JSON.stringify(response), response.originPort, response.originIP);
  }
  else {
    if(response.messageId.length<=8){ //es el primer tracker que se marcara para recorrer todos los nodos scaneando
      response.messageId = `countId=${tracker.id}`;
    }
    obj.body.trackerCount += 1;
    for (let index=tracker.min_range; index<=tracker.max_range; index++){ //añado todos los archivos guardados en este dominio
      let arrayoffiles = tracker.diccionario[index];
      if(!(typeof arrayoffiles === 'undefined')) {  //chequeo que el dominio este inicializado (buscar si hay una mejor forma de chequearlo)
        arrayoffiles.forEach(element => { obj.body.fileCount += 1; });
      }
    }
    server.send(JSON.stringify(response), tracker.sig.port, tracker.sig.host);
  }
}

function join(host, port) {
  let msg = {
    messageId: `joinId=${tracker.id}`,
    route: `/join/${tracker.id}`,
    originIP: tracker.host,
    originPort: tracker.port,
    availableSpaces: []
  }
  server.send(JSON.stringify(msg), port, host);
}

function joinEvaluation(msg) {
  let obj = JSON.parse(msg);
  let response = { ...obj };
  if(response.messageId.indexOf(`StartingId=${tracker.id}`) != -1) {  //ya se completo el recorrido de todos los trackers
    server.send(JSON.stringify(response), response.originPort, response.originIP);
    //console.log(response);
  }
  else {
    if(response.messageId.length<=10){ //es el primer tracker que se marcara para recorrer todos los nodos scaneando
      response.messageId += `StartingId=${tracker.id}`;
    }
    let available;
    let availableRange = response.availableSpaces.pop();
    if(availableRange && availableRange.partition_end==tracker.min_range-1) {  //hay un rango que podría continuar
      available = true;
      //console.log(availableRange);
    }
    else {  //sino comienzo a verificar por nuevos rangos en este nodo
      if(availableRange)
        response.availableSpaces.push({...availableRange});
      available = false;
      availableRange = {
        partition_begin: 0,
        partition_end: 0
      };
    }
    for (let index=tracker.min_range; index<=tracker.max_range; index++){ //añado todos los archivos guardados en este dominio
      let arrayoffiles = tracker.diccionario[index];
      if(typeof arrayoffiles === 'undefined') {  //chequeo que el dominio no este inicializado
        //arrayoffiles.forEach(element => { obj.body.fileCount += 1; });
        //console.log(index + ' ' + available);
        if(available){
          availableRange.partition_end = index;
        } else {
          available = true;
          availableRange.partition_begin = index;
          availableRange.partition_end = index;
        }
      } else {
        if(available) {
          available = false;
          //console.log(availableRange);
          response.availableSpaces.push({...availableRange});
          //console.log(response.availableSpaces);
        }
      }
    }
    if(available) {
      response.availableSpaces.push({...availableRange});
    }
    //console.log(response.availableSpaces);
    server.send(JSON.stringify(response), tracker.sig.port, tracker.sig.host);
  }
}

//test sha1
//console.log(sha1('ArchivoPrueba.txt'));
//console.log(sha1('1').slice(0,2));
//console.log(parseInt(sha1('ArchivoPrueba.txt').slice(0,2),16));

crearTracker();
//console.log(Object.fromEntries((tracker.diccionario[156]).entries()));
join('localhost', 8080)