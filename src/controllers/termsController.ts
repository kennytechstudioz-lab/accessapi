import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import Terms from '../models/Terms';

const DEFAULT_TERMS_CONTENT = `<h2>1. Introduction & Acceptance of Terms</h2>
<p>Welcome to Access National Bank. By accessing or using our online banking platform, mobile services, or associated digital features, you agree to be bound by these Terms and Conditions. Please read them carefully before opening an account or initiating transactions.</p>

<h2>2. Online & Mobile Banking Security</h2>
<p>Access National Bank employs industry-standard encryption, multi-factor authentication (MFA), and real-time fraud monitoring to protect your financial activities. You are responsible for maintaining the confidentiality of your credentials, including account passwords, PINs, and access tokens.</p>

<h2>3. Deposits, Transfers & Electronic Funds</h2>
<p>All deposits, international wire transfers, and internal account transfers are subject to verification and local banking regulations. Access National Bank reserves the right to hold or delay pending transactions that trigger security protocols or regulatory compliance checks.</p>

<h2>4. Account Responsibilities & Maintenance</h2>
<p>Account holders must ensure accurate personal information is maintained on file. Access National Bank reserves the right to suspend or terminate accounts engaging in fraudulent activities, money laundering, or unauthorized third-party access.</p>

<h2>5. Amendments to Terms</h2>
<p>Access National Bank reserves the right to modify or update these Terms & Conditions at any time. Notice of substantial changes will be provided via online portal announcements or direct email notification.</p>`;

const DEFAULT_PRIVACY_CONTENT = `<h2>1. Information We Collect</h2>
<p>Access National Bank collects personal information necessary to deliver secure digital banking services. This includes identification details (full name, government identifier, date of birth), contact information, financial transaction history, device metadata, and IP addresses.</p>

<h2>2. How We Use Your Data</h2>
<p>Your personal data is strictly used to authenticate transactions, prevent financial fraud, process deposits and transfers, comply with anti-money laundering (AML) directives, and improve our platform security.</p>

<h2>3. Data Protection & Encryption</h2>
<p>We implement strict technical and organizational measures to safeguard your private information. All data transmitted between your browser and our servers is encrypted using bank-grade protocols.</p>

<h2>4. Sharing & Disclosure</h2>
<p>Access National Bank does not sell or rent your personal information to third parties. Data is shared exclusively with authorized regulatory bodies, financial partners, or service providers required for core transaction processing.</p>

<h2>5. Your Privacy Rights</h2>
<p>You have the right to inspect, update, or request corrections to your personal record stored with Access National Bank. For privacy inquiries or data requests, contact our Compliance Office.</p>`;

// Get Terms & Privacy
export const getTerms = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let terms = await Terms.findOne({});
    if (!terms) {
      terms = new Terms({
        title: 'Terms & Conditions',
        content: DEFAULT_TERMS_CONTENT,
        privacyTitle: 'Privacy Policy',
        privacyContent: DEFAULT_PRIVACY_CONTENT
      });
      await terms.save();
    } else {
      let updated = false;
      if (!terms.privacyContent) {
        terms.privacyTitle = 'Privacy Policy';
        terms.privacyContent = DEFAULT_PRIVACY_CONTENT;
        updated = true;
      }
      if (!terms.content || terms.content.includes('<h1>Terms of Service</h1>')) {
        terms.title = 'Terms & Conditions';
        terms.content = DEFAULT_TERMS_CONTENT;
        updated = true;
      }
      if (updated) {
        await terms.save();
      }
    }
    res.json(terms);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching terms', error: error.message });
  }
};

// Update Terms & Privacy
export const updateTerms = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { title, content, privacyTitle, privacyContent } = req.body;
    let terms = await Terms.findOne({});
    if (!terms) {
      terms = new Terms({
        title: title || 'Terms & Conditions',
        content: content || DEFAULT_TERMS_CONTENT,
        privacyTitle: privacyTitle || 'Privacy Policy',
        privacyContent: privacyContent || DEFAULT_PRIVACY_CONTENT
      });
    } else {
      if (title !== undefined) terms.title = title;
      if (content !== undefined) terms.content = content;
      if (privacyTitle !== undefined) terms.privacyTitle = privacyTitle;
      if (privacyContent !== undefined) terms.privacyContent = privacyContent;
      terms.updatedAt = new Date();
    }

    await terms.save();
    res.json({ message: 'Terms and Privacy policy updated successfully', terms });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating terms', error: error.message });
  }
};

