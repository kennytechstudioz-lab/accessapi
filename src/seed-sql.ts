import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User';
import UserAccount from './models/UserAccount';
import EmailTemplate from './models/EmailTemplate';
import NotificationTemplate from './models/NotificationTemplate';
import Faq from './models/Faq';
import Blog from './models/Blog';



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

  // --- Seed FAQs ---
  console.log("Parsing FAQs...");
  const faqData = parseInsertBlock(sqlContent, 'faq');
  const faqDocs = faqData.rows.map(row => {
    const doc: any = {};
    faqData.cols.forEach((col, idx) => {
      if (col === 'id') return;
      doc[col] = row[idx];
    });
    return doc;
  });
  console.log(`Parsed ${faqDocs.length} FAQs. Clearing and inserting...`);
  await Faq.deleteMany({});
  await Faq.insertMany(faqDocs);
  console.log("FAQs seeded successfully.");

  // --- Seed Blogs ---
  console.log("Seeding 5 default blogs with category 'Blog'...");
  const defaultBlogs = [
    {
      category: 'Blog',
      title: 'The Future of Digital Banking: How Access National Secures Multi-Currency Transfers',
      subtitle: 'Discover our next-generation encryption protocols and instantaneous global clearing.',
      author: 'Access Editorial Board',
      banner: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=800&q=80',
      time: Math.floor(Date.now() / 1000) - 86400 * 1,
      content: `As global trade accelerates, businesses and individuals require seamless financial transactions across international borders. At Access National Bank, we have revolutionized multi-currency banking by implementing institutional-grade security, automated wire clearance, and real-time exchange rates.\n\nOur platform ensures that whether you are transferring Euros, US Dollars, or British Pounds, your assets are protected by multi-layered encryption protocols and round-the-clock fraud monitoring. With instantaneous account reconciliation, Access National clients experience financial freedom with complete peace of mind.`
    },
    {
      category: 'Blog',
      title: 'Understanding Wire Clearance and Transaction Authorization Codes (TAC)',
      subtitle: 'A comprehensive guide to regulatory security and seamless international fund movement.',
      author: 'Compliance Officer',
      banner: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=800&q=80',
      time: Math.floor(Date.now() / 1000) - 86400 * 3,
      content: `When executing high-volume cross-border wire transfers, financial compliance standards require verification checkpoints such as TAC (Transaction Authorization Codes) and IMF clearance. These protocols safeguard account holders against unauthorized transfers while maintaining compliance with international banking regulations.\n\nLearn how Access National streamlines the verification process to ensure zero delay in funds delivery while enforcing maximum security standard operating procedures across global networks.`
    },
    {
      category: 'Blog',
      title: '5 Key Strategies for Effective Multi-Currency Wealth Management',
      subtitle: 'Maximize your portfolio growth while hedging against currency volatility.',
      author: 'Senior Wealth Strategist',
      banner: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=800&q=80',
      time: Math.floor(Date.now() / 1000) - 86400 * 5,
      content: `Holding assets in multiple fiat currencies is one of the most effective ways to hedge against inflation and economic fluctuations. By leveraging Access National's integrated multi-currency accounts, clients can hold, convert, and invest across USD, EUR, GBP, and CAD with minimal conversion fees.\n\nExplore how our automated savings plans and tailored advisory services can elevate your wealth strategy and safeguard your capital reserve.`
    },
    {
      category: 'Blog',
      title: 'How Access National Maintains 99.99% Cloud Infrastructure Uptime',
      subtitle: 'An inside look at our redundant server networks and zero-downtime deployment.',
      author: 'Engineering Team',
      banner: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80',
      time: Math.floor(Date.now() / 1000) - 86400 * 7,
      content: `In modern online banking, reliability is paramount. Our engineering team utilizes high-availability cloud architecture distributed across redundant data centers. With zero-latency processing and background updates, Access National guarantees uninterrupted account access, mobile transfers, and real-time notifications for clients worldwide.`
    },
    {
      category: 'Blog',
      title: 'The Rise of Contactless & Virtual Cards in Global Commerce',
      subtitle: 'Why virtual debit cards are replacing traditional plastic for online security.',
      author: 'Digital Banking Lead',
      banner: 'https://images.unsplash.com/photo-1556742049-0a67568d0d9f?auto=format&fit=crop&w=800&q=80',
      time: Math.floor(Date.now() / 1000) - 86400 * 10,
      content: `Virtual debit cards provide an extra layer of privacy and control for online purchases and vendor payments. Instant creation, custom spending limits, and disposable card numbers make virtual cards the premier choice for modern digital consumers. Learn how to generate and manage virtual debit cards directly inside your Access National dashboard.`
    }
  ];

  await Blog.deleteMany({});
  await Blog.insertMany(defaultBlogs);
  console.log("5 default blogs seeded successfully.");

  console.log("All tables seeded successfully!");


  await mongoose.disconnect();
  console.log("Disconnected from MongoDB.");
}

runSeed().catch(err => {
  console.error("Error during seed:", err);
  process.exit(1);
});
