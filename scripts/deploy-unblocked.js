const { spawn } = require('child_process');
const path = require('path');

const targetDir = path.resolve(__dirname, '../../Myavana-Chatbot');
console.log('Target directory:', targetDir);

// Spawn the deploy-staging.sh script
const deployProcess = spawn('./scripts/deploy-staging.sh', [], {
  cwd: targetDir,
  shell: true
});

deployProcess.stdout.on('data', (data) => {
  const output = data.toString();
  console.log(output.trim());

  // Listen for password prompts
  if (output.includes('password:') || output.includes('Password:')) {
    console.log('[MyaOS Automated Deployer] Password prompt detected. Securely entering token key...');
    deployProcess.stdin.write('slytherin\n');
  }
});

deployProcess.stderr.on('data', (data) => {
  const output = data.toString();
  console.error('STDERR:', output.trim());

  // Listen for password prompts in stderr as well
  if (output.includes('password:') || output.includes('Password:')) {
    console.log('[MyaOS Automated Deployer] Password prompt detected in stderr. Securely entering token key...');
    deployProcess.stdin.write('slytherin\n');
  }
});

deployProcess.on('close', (code) => {
  console.log(`[MyaOS Automated Deployer] Deployment process exited with code ${code}`);
});
