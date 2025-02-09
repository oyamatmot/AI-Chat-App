
import fs from 'fs/promises';
import path from 'path';
import { IStorage } from './storage';
import { User, Message, InsertUser } from '@shared/schema';
import bcrypt from 'bcrypt';

const ADMIN_FILE = path.join(__dirname, 'data', 'admin.json');
const USER_FILE = path.join(__dirname, 'data', 'userAccount.json');

export async function loadAccounts() {
  try {
    const adminData = await fs.readFile(ADMIN_FILE, 'utf-8');
    const userData = await fs.readFile(USER_FILE, 'utf-8');
    return {
      admins: JSON.parse(adminData).admins,
      users: JSON.parse(userData).users
    };
  } catch (error) {
    console.error('Error loading accounts:', error);
    return { admins: [], users: [] };
  }
}

export async function saveAccount(email: string, password: string, isAdmin: boolean) {
  const hashedPassword = await bcrypt.hash(password, 10);
  const newAccount = {
    email,
    password: hashedPassword,
    verified: true,
    isAdmin
  };

  const file = isAdmin ? ADMIN_FILE : USER_FILE;
  const key = isAdmin ? 'admins' : 'users';

  try {
    const data = await fs.readFile(file, 'utf-8');
    const json = JSON.parse(data);
    json[key].push(newAccount);
    await fs.writeFile(file, JSON.stringify(json, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving account:', error);
    return false;
  }
}
