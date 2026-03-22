import { spawn } from 'node:child_process'
import process from 'node:process'

const args = process.argv.slice(2)
const command = process.platform === 'win32' ? 'mvnw.cmd' : './mvnw'

const child = spawn(command, args, {
  cwd: new URL('../server/', import.meta.url),
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
