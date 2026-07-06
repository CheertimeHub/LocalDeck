// Ring buffer เก็บ log ล่าสุดของแต่ละ service ไว้ในหน่วยความจำ
export class LogBuffer {
  constructor(maxLines = 1000) {
    this.maxLines = maxLines;
    this.lines = [];
    // เก็บเศษบรรทัดที่ chunk ตัดกลางไว้ก่อน จนกว่าจะเจอ \n
    this.partial = { stdout: '', stderr: '' };
  }

  // รับ chunk ดิบจาก stdout/stderr แล้วคืนรายการบรรทัดที่สมบูรณ์
  pushChunk(stream, chunk) {
    // strip ANSI escape codes — บางเครื่องมือยังพ่นสีมาแม้ตั้ง NO_COLOR แล้ว
    const clean = chunk.toString('utf8').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
    const text = this.partial[stream] + clean;
    const parts = text.split(/\r?\n/);
    this.partial[stream] = parts.pop() ?? '';
    const entries = parts
      .filter((line) => line.length > 0)
      .map((line) => ({ ts: Date.now(), stream, line }));
    for (const entry of entries) {
      this.lines.push(entry);
      if (this.lines.length > this.maxLines) this.lines.shift();
    }
    return entries;
  }

  pushSystem(line) {
    const entry = { ts: Date.now(), stream: 'system', line };
    this.lines.push(entry);
    if (this.lines.length > this.maxLines) this.lines.shift();
    return entry;
  }

  get() {
    return this.lines;
  }

  clear() {
    this.lines = [];
    this.partial = { stdout: '', stderr: '' };
  }
}
