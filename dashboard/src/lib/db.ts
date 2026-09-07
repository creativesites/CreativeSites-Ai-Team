import path from 'path';
import { execFileSync } from 'child_process';

const dbPath = path.resolve(process.cwd(), '../data/myaos.db');

export function queryDb(sql: string) {
  try {
    const stdout = execFileSync('sqlite3', ['-json', dbPath, sql]).toString().trim();
    return stdout ? JSON.parse(stdout) : [];
  } catch (e: any) {
    console.error('queryDb error:', e.message);
    return [];
  }
}

export function runDb(sql: string) {
  try {
    execFileSync('sqlite3', [dbPath, sql]);
    return true;
  } catch (e: any) {
    console.error('runDb error:', e.message);
    return false;
  }
}
