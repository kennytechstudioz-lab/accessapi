import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User';
import UserAccount from './models/UserAccount';
import EmailTemplate from './models/EmailTemplate';
import NotificationTemplate from './models/NotificationTemplate';

dotenv.config();

// Define Currency Schema
const CurrencySchema = new mongoose.Schema({
  name: { type: String, required: true },
  symbol: { type: String, default: '' },
  bankName: { type: String, default: '' },
  accountName: { type: String, default: '' },
  accountNumber: { type: String, default: '' },
  logo: { type: String, default: '' },
  balance: { type: Number, default: 0 },
  totalDeposit: { type: Number, default: 0 },
  totalWithdrawal: { type: Number, default: 0 },
  totalTransaction: { type: Number, default: 0 },
});
const Currency = mongoose.model('Currency', CurrencySchema);

// SQL Parsing Helper
function parseInsertBlock(sql: string, tableName: string): { cols: string[], rows: any[][] } {
  // Find "INSERT INTO `tableName` (`col1`, `col2`, ...) VALUES"
  const regex = new RegExp(`INSERT INTO \\\`?${tableName}\\\`?\\s*\\(([^)]+)\\)\\s*VALUES`, 'i');
  const match = sql.match(regex);
  if (!match) {
    throw new Error(`Could not find INSERT INTO statement for table: ${tableName}`);
  }

  const cols = match[1].split(',').map(c => c.replace(/[\`\'\"\s]+/g, ''));
  const startIndex = match.index! + match[0].length;
  
  // Find values until next semicolon
  const endIndex = sql.indexOf(';', startIndex);
  if (endIndex === -1) {
    throw new Error(`Could not find closing semicolon for table: ${tableName}`);
  }

  const valuesBlock = sql.substring(startIndex, endIndex).trim();
  
  // Split into rows by splitting on lines starting with '('
  const lines = valuesBlock.split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('('));

  const rows: any[][] = [];
  for (const line of lines) {
    let content = line.trim();
    if (content.endsWith(';')) content = content.slice(0, -1).trim();
    if (content.endsWith(',')) content = content.slice(0, -1).trim();
    if (content.startsWith('(')) content = content.slice(1);
    if (content.endsWith(')')) content = content.slice(0, -1);
    
    const parsedRow = parseSqlRow(content);
    rows.push(parsedRow);
  }

  return { cols, rows };
}

function parseSqlRow(rowText: string): any[] {
  const values: any[] = [];
  let i = 0;
  while (i < rowText.length) {
    const prevI = i;
    while (i < rowText.length && (rowText[i] === ' ' || rowText[i] === ',' || rowText[i] === '\r' || rowText[i] === '\n')) {
      i++;
    }
    if (i >= rowText.length) break;

    if (rowText[i] === "'") {
      i++;
      let str = "";
      while (i < rowText.length) {
        if (rowText[i] === "\\") {
          str += rowText[i + 1] || "";
          i += 2;
        } else if (rowText[i] === "'") {
          if (rowText[i + 1] === "'") {
            str += "'";
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          str += rowText[i];
          i++;
        }
      }
      values.push(str);
    } else {
      let valStr = "";
      while (i < rowText.length && rowText[i] !== ',' && rowText[i] !== ')') {
        valStr += rowText[i];
        i++;
      }
      valStr = valStr.trim();
      if (valStr === 'NULL') {
        values.push(null);
      } else if (valStr === '') {
        values.push('');
      } else if (!isNaN(Number(valStr))) {
        values.push(Number(valStr));
      } else {
        values.push(valStr);
      }
    }

    if (i === prevI) {
      throw new Error(`Infinite loop detected in SQL parser at index ${i} (char: '${rowText[i]}') on row: "${rowText}"`);
    }
  }
  return values;
}

async function runSeed() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGO_URI is missing from env!");
    process.exit(1);
  }

  console.log("Connecting to MongoDB...");
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB.");

  // Read SQL File
  const sqlPath = path.join(__dirname, '../../u193209056_access.sql');
  console.log("Reading SQL dump at:", sqlPath);
  const sqlContent = fs.readFileSync(sqlPath, 'utf-8');

  // --- Seed Currencies ---
  console.log("Parsing currencies...");
  const currenciesData = parseInsertBlock(sqlContent, 'currencies');
  const currencyDocs = currenciesData.rows.map(row => {
    const doc: any = {};
    currenciesData.cols.forEach((col, idx) => {
      if (col === 'id') return;
      doc[col] = row[idx];
    });
    return doc;
  });
  console.log(`Parsed ${currencyDocs.length} currencies. Clearing and inserting...`);
  await Currency.deleteMany({});
  await Currency.insertMany(currencyDocs);
  console.log("Currencies seeded successfully.");

  // --- Seed Users ---
  console.log("Parsing users...");
  const usersData = parseInsertBlock(sqlContent, 'users');
  
  const seenUsernames = new Set<string>();
  const seenEmails = new Set<string>();
  const userDocs: any[] = [];

  for (const row of usersData.rows) {
    const doc: any = {};
    usersData.cols.forEach((col, idx) => {
      if (col === 'id') return;
      
      if (col === 'password') {
        doc.passwordHash = row[idx];
      } else {
        const boolFields = [
          'suspended', 'onReview', 'taxRequest', 'imfRequest',
          'swiftCodeRequest', 'tacCodeRequest', 'requestingCard',
          'isVerified', 'deleted'
        ];
        if (boolFields.includes(col)) {
          doc[col] = row[idx] === 1 || row[idx] === true;
        } else {
          doc[col] = row[idx];
        }
      }
    });

    let username = doc.username;
    if (seenUsernames.has(username)) {
      let counter = 1;
      let newUsername = `${username}_dup${counter}`;
      while (seenUsernames.has(newUsername)) {
        counter++;
        newUsername = `${username}_dup${counter}`;
      }
      console.log(`Duplicate username detected: changing '${username}' to '${newUsername}'`);
      username = newUsername;
    }
    seenUsernames.add(username);
    doc.username = username;

    let email = doc.email;
    if (seenEmails.has(email)) {
      const parts = email.split('@');
      let counter = 1;
      let newEmail = `${parts[0]}+dup${counter}@${parts[1]}`;
      while (seenEmails.has(newEmail)) {
        counter++;
        newEmail = `${parts[0]}+dup${counter}@${parts[1]}`;
      }
      console.log(`Duplicate email detected for user '${username}': changing '${email}' to '${newEmail}'`);
      email = newEmail;
    }
    seenEmails.add(email);
    doc.email = email;

    userDocs.push(doc);
  }

  console.log(`Parsed ${userDocs.length} users. Clearing and inserting...`);
  await User.deleteMany({});
  await User.insertMany(userDocs);
  console.log("Users seeded successfully.");

  const usernameToAccountNumber = new Map<string, string>();
  for (const user of userDocs) {
    usernameToAccountNumber.set(user.username, user.accountNumber);
  }

  // --- Seed User Accounts ---
  console.log("Parsing user_accounts...");
  const userAccountsData = parseInsertBlock(sqlContent, 'user_accounts');
  
  const seenUserAccounts = new Set<string>();
  const userAccountDocs: any[] = [];

  for (const row of userAccountsData.rows) {
    const doc: any = {};
    userAccountsData.cols.forEach((col, idx) => {
      if (col === 'id' || col === 'currencyId') return;
      doc[col] = row[idx];
    });

    if (!doc.accountNumber) {
      doc.accountNumber = usernameToAccountNumber.get(doc.username) || '';
    }

    const key = `${doc.username}:${doc.currency}`;
    if (seenUserAccounts.has(key)) {
      console.log(`Skipping duplicate user account row for key: ${key}`);
      continue;
    }
    seenUserAccounts.add(key);
    userAccountDocs.push(doc);
  }

  console.log(`Parsed ${userAccountDocs.length} unique user accounts. Clearing and inserting...`);
  await UserAccount.deleteMany({});
  await UserAccount.insertMany(userAccountDocs);
  console.log("User accounts seeded successfully.");

  // --- Seed Email Templates ---
  console.log("Parsing email templates...");
  const emailsData = parseInsertBlock(sqlContent, 'emails');
  const emailDocs = emailsData.rows.map(row => {
    const doc: any = {};
    emailsData.cols.forEach((col, idx) => {
      if (col === 'id' || col === 'time') return;
      doc[col] = row[idx];
    });
    return doc;
  });
  console.log(`Parsed ${emailDocs.length} email templates. Clearing and inserting...`);
  await EmailTemplate.deleteMany({});
  await EmailTemplate.insertMany(emailDocs);
  console.log("Email templates seeded successfully.");

  // --- Seed Notification Templates ---
  console.log("Parsing notification templates...");
  const notifsTempData = parseInsertBlock(sqlContent, 'notifications_temp');
  const notifDocs = notifsTempData.rows.map(row => {
    const doc: any = {};
    notifsTempData.cols.forEach((col, idx) => {
      if (col === 'id') return;
      doc[col] = row[idx];
    });
    return doc;
  });
  console.log(`Parsed ${notifDocs.length} notification templates. Clearing and inserting...`);
  await NotificationTemplate.deleteMany({});
  await NotificationTemplate.insertMany(notifDocs);
  console.log("Notification templates seeded successfully.");

  console.log("All tables seeded successfully!");
  await mongoose.disconnect();
  console.log("Disconnected from MongoDB.");
}

runSeed().catch(err => {
  console.error("Error during seed:", err);
  process.exit(1);
});
