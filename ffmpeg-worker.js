// Worker pendamping satu-origin untuk ffmpeg.wasm.
// Browser tidak mengizinkan `new Worker()` dari skrip di domain lain (CDN),
// tetapi sebuah worker satu-origin boleh meng-import modul dari CDN.
import "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/worker.js";
