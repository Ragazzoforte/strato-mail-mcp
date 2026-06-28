# Strato Mail MCP Server v2

**Volledige mail client voor Claude via IMAP + SMTP** — perfect voor Portainer hosting.

---

## 🎯 Features

✅ **IMAP Functionaliteit:**
- Alle mails lezen (onderwerp, body, HTML, headers)
- Zoeken met geavanceerde IMAP filters
- Folder management (switch, list)
- Email flags (read/unread, starred, draft)
- Attachment handling
- Bulk operations

✅ **SMTP Functionaliteit:**
- Mails verzenden
- CC/BCC support
- HTML + plain text

✅ **Extra:**
- Mailbox statistics
- Draft management
- Portainer-ready Docker setup
- Attachment persistence
- Health checks

---

## 🚀 Quick Start (Docker in Portainer)

### 1. In Portainer: Stacks → Add Stack

**Name:** `strato-mail-mcp`

**Paste this:**
```yaml
version: '3.8'

services:
  strato-mail-mcp:
    build:
      context: https://github.com/yourusername/strato-mail-mcp.git
      dockerfile: Dockerfile
    container_name: strato-mail-mcp
    image: strato-mail-mcp:latest
    restart: unless-stopped
    environment:
      IMAP_HOST: imap.strato.com
      IMAP_PORT: 993
      IMAP_USER: ${IMAP_USER}
      IMAP_PASSWORD: ${IMAP_PASSWORD}
      SMTP_HOST: smtp.strato.com
      SMTP_PORT: 465
      ATTACHMENT_DIR: /app/attachments
      NODE_ENV: production
    volumes:
      - strato-attachments:/app/attachments
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  strato-attachments:
    driver: local
```

### 2. Set Environment Variables

In Portainer Stack UI, add before deploying:

```
IMAP_USER=jouw-email@example.com
IMAP_PASSWORD=jouw-strato-password
```

### 3. Deploy

Click **"Deploy the stack"** → Wait ~30 seconds

### 4. Verify

In Portainer → Containers → `strato-mail-mcp`
- Should show `Running`
- Logs should show: `[strato-mail-mcp] ✓ Server started - Ready for Claude`

---

## 🔗 Integratie met Claude

### Option A: Lokaal (Windows/Mac/Linux)

Ga naar Claude Settings → Developer → MCP Settings:

```json
{
  "mcpServers": {
    "strato-mail": {
      "command": "node",
      "args": ["/path/to/strato-mail-mcp/server.js"],
      "env": {
        "IMAP_USER": "jouw-email@example.com",
        "IMAP_PASSWORD": "jouw-password"
      }
    }
  }
}
```

**Herstart Claude** → `strato-mail` is nu beschikbaar

### Option B: Remote Docker (SSH naar Portainer host)

```json
{
  "mcpServers": {
    "strato-mail": {
      "command": "docker",
      "args": ["exec", "-i", "strato-mail-mcp", "node", "/app/server.js"],
      "env": {
        "IMAP_USER": "jouw-email@example.com",
        "IMAP_PASSWORD": "jouw-password"
      }
    }
  }
}
```

---

## 📧 Beschikbare Tools

### Read & Search

```
get_folders()
→ List alle mail folders (INBOX, Sent, Drafts, etc.)

search_emails(query, limit, folder)
→ Search met IMAP syntax:
   - ALL
   - UNSEEN
   - SEEN
   - FROM "user@example.com"
   - SUBJECT "keyword"
   - SINCE 15-Mar-2024
   - FLAGGED
   - DRAFT
   Voorbeelden: "UNSEEN FROM triple-audio", "ALL", "FLAGGED"

read_email(uid)
→ Lees volledige email (with attachments)

get_recent(count, folder)
→ Haal X recente mails (default 20)

get_mailbox_status()
→ Get folder statistieken (total, unread, recent)
```

### Send & Draft

```
send_email(to, subject, text/html, cc, bcc)
→ Verstuur email direct

save_draft(to, subject, text/html)
→ Opslaan als concept
```

### Manage

```
mark_read(uids)
→ Mark emails as read

mark_unread(uids)
→ Mark emails as unread

mark_flagged(uids)
→ Star/flag emails

unmark_flagged(uids)
→ Remove star

switch_folder(folder)
→ Switch to different folder

move_email(uids, folder)
→ Move emails to folder

delete_email(uids)
→ Delete emails
```

### Files

```
get_attachment(uid, filename)
→ Get attachment path (for Claude to access)
```

---

## 🔧 Configuration Details

### Strato Settings

**IMAP:**
- Host: `imap.strato.com` (SSL/TLS)
- Port: `993`
- User: je Strato email
- Pass: je Strato password

**SMTP:**
- Host: `smtp.strato.com` (SSL/TLS)
- Port: `465`
- User: je Strato email
- Pass: je Strato password

### Docker Volumes

- `strato-attachments` → Attachments opgeslagen in `/app/attachments`
- Persisten over container restarts

### Resource Limits

- CPU: max `0.5` cores
- Memory: max `256MB`
- Reserved: `0.25` CPU, `128MB` RAM

---

## 🐛 Troubleshooting

### "IMAP connection failed"

```
Check in Portainer logs:
Containers → strato-mail-mcp → Logs

Waarschijnlijke oorzaken:
- IMAP_USER/PASSWORD incorrect
- Strato account IMAP disabled
- Network firewall port 993 blocked
```

### "SMTP auth failed"

```
Check:
- IMAP_PASSWORD is correct (same for SMTP at Strato)
- Strato account allows SMTP
- Port 465 not blocked
```

### Attachments not saving

```
Check volume is mounted:
docker inspect strato-mail-mcp | grep -A 5 Mounts

Should show: /app/attachments → strato-attachments
```

### Slow searches

```
IMAP is inherent slow for large mailboxes.
Use more specific queries:
- "UNSEEN" instead of "ALL"
- "FROM example.com" to narrow down
- Limit parameter
```

---

## 📈 Monitoring

### In Portainer

1. Containers → `strato-mail-mcp`
2. Stats tab → CPU/Memory usage
3. Logs → Real-time activity

### Docker CLI

```bash
# Follow logs
docker logs -f strato-mail-mcp

# Container stats
docker stats strato-mail-mcp

# Shell access (debug)
docker exec -it strato-mail-mcp sh
```

---

## 🔐 Security

⚠️ **Credentials Storage:**

- `.env` contains password (NEVER commit to git!)
- In Portainer: credentials stored in container variables (encrypted)
- In Docker: use `.env` file OR Portainer UI (don't hardcode)
- Recommended: Use Portainer "Secrets" for production

**Access Control:**
- Container runs as non-root user
- TLS/SSL for IMAP (993) and SMTP (465)
- Local filesystem attachments only

---

## 🚀 Advanced

### Custom Folders

Strato default folders: `INBOX`, `Sent`, `Drafts`, `Trash`, `Junk`

If you have custom folders, use full path:
```
switch_folder("folder/subfolder")
```

### Email Size Limits

Strato typically allows:
- Single mail: up to 50MB (with attachments)
- Mailbox: depends on plan

Large attachments are downloaded to container volume automatically.

### Rate Limiting

IMAP servers have implicit rate limits. If you get "too many connections":
- Reduce concurrent searches
- Add delays between operations
- Use specific queries instead of broad searches

---

## 📝 API Examples (in Claude)

### Search unread emails
```
"Search my unread emails from Triple Audio"
→ Claude calls: search_emails(query="UNSEEN FROM triple-audio")
```

### Read recent mails
```
"Show me my last 5 emails"
→ Claude calls: get_recent(count=5)
```

### Send email
```
"Send email to marco@triple-audio.nl with subject 'Themis Update'"
→ Claude calls: send_email(to="marco@...", subject="Themis Update", text="...", html="...")
```

### Manage folders
```
"Move all Themis emails to a folder"
→ Claude calls: search_emails(query='SUBJECT "Themis"') → move_email(uids=[...], folder="Themis")
```

---

## 🛑 Stopping / Updating

### In Portainer

1. Stacks → `strato-mail-mcp`
2. Stop: click **Stop**
3. Update: remove stack, re-deploy with new code
4. Logs: check health status

### Docker CLI

```bash
# Stop
docker-compose down

# Restart
docker-compose up -d

# View logs
docker logs strato-mail-mcp
```

---

## 📞 Support

If issues:

1. Check logs: `docker logs strato-mail-mcp`
2. Verify Strato credentials work in email client
3. Check IMAP/SMTP ports (993, 465) are accessible
4. Ensure `.env` is correctly set

---

**Version:** 2.0.0  
**Status:** ✅ Production-ready for Portainer
