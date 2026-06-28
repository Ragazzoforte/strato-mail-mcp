#!/usr/bin/env node

import Imap from 'imap';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Configuration
const CONFIG = {
  imap: {
    host: process.env.IMAP_HOST || 'imap.strato.com',
    port: parseInt(process.env.IMAP_PORT || '993'),
    user: process.env.IMAP_USER || '',
    password: process.env.IMAP_PASSWORD || '',
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
  },
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.strato.com',
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: true,
    auth: {
      user: process.env.IMAP_USER || '',
      pass: process.env.IMAP_PASSWORD || '',
    },
  },
  attachmentDir: process.env.ATTACHMENT_DIR || '/tmp/mail-attachments',
};

// Validate
if (!CONFIG.imap.user || !CONFIG.imap.password) {
  console.error('ERROR: IMAP_USER and IMAP_PASSWORD required');
  process.exit(1);
}

// Create attachment directory
if (!fs.existsSync(CONFIG.attachmentDir)) {
  fs.mkdirSync(CONFIG.attachmentDir, { recursive: true });
}

let imap = null;
let transporter = null;
let currentFolder = 'INBOX';
let emailCache = {};

// Initialize transporter
function initTransporter() {
  transporter = nodemailer.createTransport(CONFIG.smtp);
}

// Initialize IMAP
function createImapConnection() {
  return new Promise((resolve, reject) => {
    imap = new Imap(CONFIG.imap);
    imap.openBox(currentFolder, false, (err, box) => {
      if (err) reject(err);
      else {
        console.error(`[IMAP] Connected to ${currentFolder}`);
        resolve(box);
      }
    });
    imap.on('error', (err) => console.error('[IMAP Error]', err));
    imap.on('end', () => console.error('[IMAP] Connection ended'));
  });
}

// Helper: Ensure IMAP connected
async function ensureImap() {
  if (!imap || !imap.state) {
    await createImapConnection();
  }
}

// Parse email
async function parseEmail(msg, uid) {
  return new Promise((resolve) => {
    simpleParser(msg, async (err, parsed) => {
      if (err) {
        resolve({ uid, error: err.message });
        return;
      }

      const attachments = [];
      if (parsed.attachments && parsed.attachments.length > 0) {
        for (const att of parsed.attachments) {
          const filename = att.filename || `attachment_${uid}_${Date.now()}`;
          const filepath = path.join(CONFIG.attachmentDir, `${uid}_${filename}`);
          try {
            fs.writeFileSync(filepath, att.content);
            attachments.push({
              filename,
              size: att.size,
              mimeType: att.contentType,
              path: filepath,
              contentId: att.contentId,
            });
          } catch (e) {
            console.error('Failed to save attachment:', e);
          }
        }
      }

      resolve({
        uid,
        from: parsed.from?.text || '',
        to: parsed.to?.text || '',
        cc: parsed.cc?.text || '',
        subject: parsed.subject || '(no subject)',
        text: parsed.text || '',
        html: parsed.html || '',
        date: parsed.date?.toISOString() || '',
        messageId: parsed.messageId || '',
        inReplyTo: parsed.inReplyTo || '',
        attachments,
      });
    });
  });
}

// Get email by UID
async function getEmailByUid(uid) {
  if (emailCache[uid]) return emailCache[uid];

  return new Promise((resolve, reject) => {
    const f = imap.fetch(uid, { bodies: '' });
    f.on('message', (msg) => {
      parseEmail(msg, uid).then((email) => {
        emailCache[uid] = email;
        resolve(email);
      });
    });
    f.on('error', reject);
  });
}

// Search emails
async function searchEmails(query) {
  return new Promise((resolve, reject) => {
    imap.search(query, (err, results) => {
      if (err) reject(err);
      else resolve(results || []);
    });
  });
}

// Get folders
async function getFolders() {
  return new Promise((resolve, reject) => {
    imap.getBoxes((err, mailboxes) => {
      if (err) reject(err);
      else {
        const folders = [];
        const traverse = (box, prefix = '') => {
          for (const key in box) {
            const mailbox = box[key];
            const fullPath = prefix ? prefix + mailbox.delimiter + mailbox.name : mailbox.name;
            folders.push({
              name: mailbox.name,
              path: fullPath,
              delimiter: mailbox.delimiter,
              attribs: mailbox.attribs || [],
            });
            if (mailbox.children) {
              traverse(mailbox.children, fullPath);
            }
          }
        };
        traverse(mailboxes);
        resolve(folders);
      }
    });
  });
}

// Add flags
async function addFlags(uid, flags) {
  return new Promise((resolve, reject) => {
    imap.addFlags(uid, flags, (err) => {
      if (err) reject(err);
      else resolve(true);
    });
  });
}

// Remove flags
async function removeFlags(uid, flags) {
  return new Promise((resolve, reject) => {
    imap.delFlags(uid, flags, (err) => {
      if (err) reject(err);
      else resolve(true);
    });
  });
}

// Move email
async function moveEmail(uid, destinationFolder) {
  return new Promise((resolve, reject) => {
    imap.move(uid, destinationFolder, (err) => {
      if (err) reject(err);
      else resolve(true);
    });
  });
}

// Delete email
async function deleteEmail(uid) {
  return new Promise((resolve, reject) => {
    imap.delFlags(uid, '\\Deleted', (err) => {
      if (err) reject(err);
      else {
        imap.expunge((expErr) => {
          if (expErr) reject(expErr);
          else resolve(true);
        });
      }
    });
  });
}

// Server
const server = new Server(
  {
    name: 'strato-mail-mcp',
    version: '2.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_folders',
        description: 'List all mail folders (INBOX, Sent, Drafts, etc.)',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'search_emails',
        description:
          'Search emails. IMAP syntax: ALL, UNSEEN, SEEN, FLAGGED, DRAFT, FROM "user@example.com", SUBJECT "word", BODY "word", SINCE 15-Mar-2024, BEFORE 20-Mar-2024',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'IMAP search query' },
            limit: { type: 'number', description: 'Max results (default 50)' },
            folder: { type: 'string', description: 'Folder to search (default INBOX)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'read_email',
        description: 'Read full email content by UID',
        inputSchema: {
          type: 'object',
          properties: {
            uid: { type: 'number', description: 'Email UID' },
          },
          required: ['uid'],
        },
      },
      {
        name: 'get_recent',
        description: 'Get recent emails from specified folder',
        inputSchema: {
          type: 'object',
          properties: {
            count: { type: 'number', description: 'Number of emails (default 20)' },
            folder: { type: 'string', description: 'Folder (default INBOX)' },
          },
        },
      },
      {
        name: 'send_email',
        description: 'Send email via SMTP',
        inputSchema: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Recipient(s), comma-separated' },
            cc: { type: 'string', description: 'CC recipients' },
            bcc: { type: 'string', description: 'BCC recipients' },
            subject: { type: 'string', description: 'Email subject' },
            text: { type: 'string', description: 'Plain text body' },
            html: { type: 'string', description: 'HTML body' },
          },
          required: ['to', 'subject'],
        },
      },
      {
        name: 'save_draft',
        description: 'Save email as draft (IMAP DRAFT folder)',
        inputSchema: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Recipient(s)' },
            subject: { type: 'string', description: 'Subject' },
            text: { type: 'string', description: 'Body' },
            html: { type: 'string', description: 'HTML body' },
          },
          required: ['to', 'subject'],
        },
      },
      {
        name: 'mark_read',
        description: 'Mark email(s) as read',
        inputSchema: {
          type: 'object',
          properties: {
            uids: {
              type: 'array',
              items: { type: 'number' },
              description: 'Email UIDs',
            },
          },
          required: ['uids'],
        },
      },
      {
        name: 'mark_unread',
        description: 'Mark email(s) as unread',
        inputSchema: {
          type: 'object',
          properties: {
            uids: {
              type: 'array',
              items: { type: 'number' },
              description: 'Email UIDs',
            },
          },
          required: ['uids'],
        },
      },
      {
        name: 'mark_flagged',
        description: 'Star/flag email(s)',
        inputSchema: {
          type: 'object',
          properties: {
            uids: {
              type: 'array',
              items: { type: 'number' },
              description: 'Email UIDs',
            },
          },
          required: ['uids'],
        },
      },
      {
        name: 'unmark_flagged',
        description: 'Remove star/flag from email(s)',
        inputSchema: {
          type: 'object',
          properties: {
            uids: {
              type: 'array',
              items: { type: 'number' },
              description: 'Email UIDs',
            },
          },
          required: ['uids'],
        },
      },
      {
        name: 'move_email',
        description: 'Move email(s) to folder',
        inputSchema: {
          type: 'object',
          properties: {
            uids: {
              type: 'array',
              items: { type: 'number' },
              description: 'Email UIDs',
            },
            folder: { type: 'string', description: 'Destination folder' },
          },
          required: ['uids', 'folder'],
        },
      },
      {
        name: 'delete_email',
        description: 'Delete email(s)',
        inputSchema: {
          type: 'object',
          properties: {
            uids: {
              type: 'array',
              items: { type: 'number' },
              description: 'Email UIDs',
            },
          },
          required: ['uids'],
        },
      },
      {
        name: 'switch_folder',
        description: 'Switch to different folder',
        inputSchema: {
          type: 'object',
          properties: {
            folder: { type: 'string', description: 'Folder name (e.g., INBOX, Sent, Drafts)' },
          },
          required: ['folder'],
        },
      },
      {
        name: 'get_attachment',
        description: 'Get attachment file path',
        inputSchema: {
          type: 'object',
          properties: {
            uid: { type: 'number', description: 'Email UID' },
            filename: { type: 'string', description: 'Attachment filename' },
          },
          required: ['uid', 'filename'],
        },
      },
      {
        name: 'get_mailbox_status',
        description: 'Get current folder statistics',
        inputSchema: { type: 'object', properties: {} },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    await ensureImap();
    if (!transporter) initTransporter();

    const { name, arguments: args } = request.params;

    // get_folders
    if (name === 'get_folders') {
      const folders = await getFolders();
      return {
        content: [{ type: 'text', text: JSON.stringify(folders, null, 2) }],
      };
    }

    // search_emails
    if (name === 'search_emails') {
      const folder = args.folder || currentFolder;
      const limit = args.limit || 50;

      if (folder !== currentFolder) {
        await new Promise((resolve, reject) => {
          imap.openBox(folder, false, (err) => {
            if (err) reject(err);
            else {
              currentFolder = folder;
              resolve();
            }
          });
        });
      }

      const uids = await searchEmails([args.query]);
      const results = uids.slice(0, limit).map((uid) => ({ uid }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { query: args.query, folder, found: uids.length, returned: results.length, results },
              null,
              2
            ),
          },
        ],
      };
    }

    // read_email
    if (name === 'read_email') {
      const email = await getEmailByUid(args.uid);
      return { content: [{ type: 'text', text: JSON.stringify(email, null, 2) }] };
    }

    // get_recent
    if (name === 'get_recent') {
      const count = args.count || 20;
      const folder = args.folder || currentFolder;

      if (folder !== currentFolder) {
        await new Promise((resolve, reject) => {
          imap.openBox(folder, false, (err) => {
            if (err) reject(err);
            else {
              currentFolder = folder;
              resolve();
            }
          });
        });
      }

      const uids = await searchEmails(['ALL']);
      const recent = uids.slice(-count).reverse();
      const emails = await Promise.all(recent.map((uid) => getEmailByUid(uid)));

      return { content: [{ type: 'text', text: JSON.stringify(emails, null, 2) }] };
    }

    // send_email
    if (name === 'send_email') {
      const mailOptions = {
        from: CONFIG.imap.user,
        to: args.to,
        cc: args.cc || '',
        bcc: args.bcc || '',
        subject: args.subject,
        text: args.text || '',
        html: args.html || '',
      };

      const info = await transporter.sendMail(mailOptions);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { success: true, messageId: info.messageId, response: info.response },
              null,
              2
            ),
          },
        ],
      };
    }

    // save_draft
    if (name === 'save_draft') {
      const mailOptions = {
        from: CONFIG.imap.user,
        to: args.to,
        subject: args.subject,
        text: args.text || '',
        html: args.html || '',
      };

      await new Promise((resolve, reject) => {
        imap.openBox('Drafts', false, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const draftContent = `From: ${mailOptions.from}\r\nTo: ${mailOptions.to}\r\nSubject: ${mailOptions.subject}\r\n\r\n${mailOptions.text || mailOptions.html}`;

      await new Promise((resolve, reject) => {
        imap.append(draftContent, { mailbox: 'Drafts', flags: '\\Draft' }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      currentFolder = 'Drafts';
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
    }

    // mark_read
    if (name === 'mark_read') {
      await addFlags(args.uids, '\\Seen');
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
    }

    // mark_unread
    if (name === 'mark_unread') {
      await removeFlags(args.uids, '\\Seen');
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
    }

    // mark_flagged
    if (name === 'mark_flagged') {
      await addFlags(args.uids, '\\Flagged');
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
    }

    // unmark_flagged
    if (name === 'unmark_flagged') {
      await removeFlags(args.uids, '\\Flagged');
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
    }

    // move_email
    if (name === 'move_email') {
      for (const uid of args.uids) {
        await moveEmail(uid, args.folder);
      }
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
    }

    // delete_email
    if (name === 'delete_email') {
      for (const uid of args.uids) {
        await deleteEmail(uid);
      }
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
    }

    // switch_folder
    if (name === 'switch_folder') {
      await new Promise((resolve, reject) => {
        imap.openBox(args.folder, false, (err, box) => {
          if (err) reject(err);
          else {
            currentFolder = args.folder;
            resolve(box);
          }
        });
      });
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, folder: args.folder }) }],
      };
    }

    // get_attachment
    if (name === 'get_attachment') {
      const filepath = path.join(CONFIG.attachmentDir, `${args.uid}_${args.filename}`);
      const exists = fs.existsSync(filepath);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              filename: args.filename,
              path: filepath,
              exists,
            }),
          },
        ],
      };
    }

    // get_mailbox_status
    if (name === 'get_mailbox_status') {
      return new Promise((resolve, reject) => {
        imap.status(currentFolder, (err, box) => {
          if (err) reject(err);
          else {
            resolve({
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      folder: currentFolder,
                      total: box.messages,
                      unseen: box.unseen,
                      recent: box.recent,
                    },
                    null,
                    2
                  ),
                },
              ],
            });
          }
        });
      });
    }

    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

process.on('SIGINT', () => {
  if (imap) {
    imap.closeBox(false, () => {
      imap.end();
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

async function main() {
  initTransporter();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[strato-mail-mcp] ✓ Server started - Ready for Claude');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
