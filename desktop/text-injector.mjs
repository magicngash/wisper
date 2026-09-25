import { clipboard } from 'electron';
import { spawn } from 'node:child_process';

export function insertTextIntoActiveWindow(text) {
  clipboard.writeText(text);

  return new Promise((resolve, reject) => {
    const script = [
      'Add-Type @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'public static class NativePaste {',
      '  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public MOUSEKEYBDHARDWAREINPUT data; }',
      '  [StructLayout(LayoutKind.Explicit, Size=32)] public struct MOUSEKEYBDHARDWAREINPUT { [FieldOffset(0)] public KEYBDINPUT keyboard; }',
      '  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }',
      '  [DllImport("user32.dll", SetLastError=true)] public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);',
      '  public static void Paste() {',
      '    var inputs = new INPUT[4];',
      '    inputs[0].type=1; inputs[0].data.keyboard.wVk=0x11;',
      '    inputs[1].type=1; inputs[1].data.keyboard.wVk=0x56;',
      '    inputs[2].type=1; inputs[2].data.keyboard.wVk=0x56; inputs[2].data.keyboard.dwFlags=2;',
      '    inputs[3].type=1; inputs[3].data.keyboard.wVk=0x11; inputs[3].data.keyboard.dwFlags=2;',
      '    SendInput(4, inputs, Marshal.SizeOf(typeof(INPUT)));',
      '  }',
      '}',
      '"@',
      'Start-Sleep -Milliseconds 100',
      '[NativePaste]::Paste()',
    ].join('\n');

    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let errorOutput = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Text insertion timed out. The active application may not accept paste.'));
    }, 5000);
    child.stderr.on('data', (chunk) => { errorOutput += chunk.toString(); });
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(errorOutput.trim() || `Text insertion failed with exit code ${code}.`));
    });
  });
}
