// Stand-in for ffmpeg on Windows: creates the output file only after a device-open
// delay, keeps audio buffered in memory, and writes it only on a graceful "q" stop.
// A kill() (TerminateProcess on Windows, SIGINT on POSIX) leaves the file at 0 bytes.
import fs from "node:fs";

const [file, openDelayMs = "0", mode = "record"] = process.argv.slice(2);

if (mode === "fail") {
  process.stderr.write("Could not find audio only device\n");
  process.exit(1);
}

const keepAlive = setInterval(() => {}, 1000);
let pcmBytes = 0;
let sampler;

setTimeout(() => {
  fs.writeFileSync(file, "");
  sampler = setInterval(() => {
    pcmBytes += 3200;
  }, 100);
}, Number(openDelayMs));

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  if (!chunk.includes("q")) return;
  clearInterval(sampler);
  clearInterval(keepAlive);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmBytes, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24);
  header.writeUInt32LE(32000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmBytes, 40);
  fs.writeFileSync(file, Buffer.concat([header, Buffer.alloc(pcmBytes)]));
  process.exit(0);
});
