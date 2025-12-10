import { exec as execSync, spawn } from 'node:child_process';

export function exec(command: string, logStdout = false, logStderr = false, indent = '') {
  return new Promise<void | string>((resolve, reject) => {
    const child = spawn(command, { shell: true });

    let stdOutCopy = '';

    if (child.stdout) {
      child.stdout.on('data', (data: Buffer) => {
        const text = data.toString();
        stdOutCopy += text;
        if (logStdout) {
          process.stdout.write(
            text
              .split('\n')
              .map((line) => (line ? indent + line : ''))
              .join('\n')
          );
        }
      });
    }

    let stdErrorCopy = '';

    if (child.stderr && logStderr) {
      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        stdErrorCopy += text;
        process.stderr.write(
          text
            .split('\n')
            .map((line) => (line ? indent + line : ''))
            .join('\n')
        );
      });
    }

    child.on('error', reject);

    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(`Command failed: ${command}\n\n(exit code ${code})\n\nError output:\n${stdErrorCopy}`)
        );
      } else if (logStdout === false) {
        resolve(stdOutCopy);
      } else {
        resolve();
      }
    });
  });
}
