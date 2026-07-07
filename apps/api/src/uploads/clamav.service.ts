import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'net';
import { Readable } from 'stream';

// Antivirus scanning via a clamd daemon (the clamav container in
// docker-compose) using the INSTREAM protocol — no temp files, the object is
// streamed straight from MinIO through the scanner.
//
// Policy decisions (documented in SECURITY.md):
// - CLAMAV_HOST empty/unset → scanning disabled, uploads marked SKIPPED
// - scanner unreachable/errors → FAIL-OPEN: upload allowed, marked FAILED and
//   logged loudly. For an internal tool, blocking all file sharing whenever
//   the AV container hiccups would hurt more than it protects. Flip to
//   fail-closed by treating FAILED like INFECTED in the two guard points.
// - INFECTED → object deleted from storage immediately; record kept as
//   evidence; attach + download both refuse it.
@Injectable()
export class ClamavService {
  private readonly logger = new Logger(ClamavService.name);
  readonly host = process.env.CLAMAV_HOST ?? '';
  readonly port = Number(process.env.CLAMAV_PORT ?? 3310);

  get enabled() {
    return this.host.length > 0;
  }

  // Returns 'CLEAN' | 'INFECTED' | 'FAILED'
  async scanStream(stream: Readable): Promise<{ verdict: 'CLEAN' | 'INFECTED' | 'FAILED'; signature?: string }> {
    if (!this.enabled) return { verdict: 'FAILED' };
    return new Promise((resolve) => {
      const socket = new Socket();
      let response = '';
      let settled = false;
      const done = (r: { verdict: 'CLEAN' | 'INFECTED' | 'FAILED'; signature?: string }) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        stream.destroy();
        resolve(r);
      };

      socket.setTimeout(120_000, () => done({ verdict: 'FAILED' }));
      socket.on('error', (err) => {
        this.logger.warn(`clamd connection failed: ${err.message}`);
        done({ verdict: 'FAILED' });
      });
      socket.on('data', (d) => {
        response += d.toString();
        if (response.includes('\0') || response.includes('\n')) {
          const text = response.trim();
          if (/OK$/.test(text)) return done({ verdict: 'CLEAN' });
          const found = text.match(/:\s*(.+)\s+FOUND/);
          if (found) return done({ verdict: 'INFECTED', signature: found[1] });
          this.logger.warn(`clamd unexpected reply: ${text}`);
          done({ verdict: 'FAILED' });
        }
      });

      socket.connect(this.port, this.host, () => {
        socket.write('zINSTREAM\0');
        stream.on('data', (chunk: Buffer) => {
          const size = Buffer.alloc(4);
          size.writeUInt32BE(chunk.length, 0);
          socket.write(size);
          socket.write(chunk);
        });
        stream.on('end', () => {
          socket.write(Buffer.alloc(4)); // zero-length chunk terminates
        });
        stream.on('error', () => done({ verdict: 'FAILED' }));
      });
    });
  }
}
