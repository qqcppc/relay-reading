// Artificial PCM only, returned as memory bytes; never a real recording/file.
function wav(duration=.5,amplitude=.1,frequency=440){
 const rate=24000,samples=Math.round(duration*rate),bytes=Buffer.alloc(44+samples*2);
 bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(samples*2,40);
 for(let i=0;i<samples;i++)bytes.writeInt16LE(Math.round(Math.sin(2*Math.PI*frequency*i/rate)*amplitude*32767),44+i*2);return bytes;
}
module.exports={wav};
