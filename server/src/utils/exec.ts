import { exec as execSync } from 'node:child_process';

export function exec(command: string, logStdout = false, logStderr = false, indent = '') {
  return new Promise<void | string>((resolve, reject) => {
    const child = execSync(command);

    let stdOutCopy = '';
    if (child.stdout) {
      child.stdout.on('data', (data: string) => {
        stdOutCopy += data;
        if (logStdout) {
          process.stdout.write(
            indent +
              data
                .toString()
                .split('\n')
                .map((line) => (line ? indent + line : ''))
                .join('\n')
          );
        }
      });
    }

    if (child.stderr && logStderr) {
      child.stderr.on('data', (data: string) => {
        process.stderr.write(
          indent +
            data
              .toString()
              .split('\n')
              .map((line) => (line ? indent + line : ''))
              .join('\n')
        );
      });
    }

    child.on('error', reject);

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed: ${command} (exit code ${code})`));
      } else if (logStdout === false) {
        resolve(stdOutCopy);
      } else {
        resolve();
      }
    });
  });
}
