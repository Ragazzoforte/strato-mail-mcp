# 🐳 Strato Mail MCP - Portainer Quickstart

## 3-Stap Setup (5 minuten)

### Stap 1: Git Clone naar je server

```bash
# SSH naar je Ubuntu/Portainer host
ssh michel@192.168.x.x

# Clone repo
git clone <repo-url> /home/michel/strato-mail-mcp
cd /home/michel/strato-mail-mcp

# Create .env
cp .env.example .env
nano .env
# Vul in: IMAP_USER en IMAP_PASSWORD
# Save: Ctrl+X → Y → Enter
```

### Stap 2: In Portainer UI

1. **Stacks** (linker menu)
2. **"+ Add Stack"** (blauw knopje)
3. **Name:** `strato-mail-mcp`
4. **Build method:** `Git Repository`
5. **Repository URL:** `https://github.com/yourusername/strato-mail-mcp.git`
6. **Repository reference:** `main` (of je branch)
7. **Compose path:** `docker-compose.yml`
8. **Environment variables:**
   - Key: `IMAP_USER` → Value: `jouw-email@example.com`
   - Key: `IMAP_PASSWORD` → Value: `jouw-strato-password`
9. **Deploy**

### Stap 3: Verify & Connect

```bash
# Check status
docker logs -f strato-mail-mcp

# Should output:
# [strato-mail-mcp] ✓ Server started - Ready for Claude
```

Toen "Ctrl+C" om logs af te sluiten.

---

## 🔗 Claude integratie

### In Claude.ai / Claude Desktop

**Settings → Developer → Edit MCP Settings**

Voeg toe (JSON):

```json
{
  "mcpServers": {
    "strato-mail": {
      "command": "docker",
      "args": ["exec", "-i", "strato-mail-mcp", "node", "/app/server.js"]
    }
  }
}
```

**Herstart Claude** ✓

---

## ✅ Test Commands

In Claude, test deze commands:

```
"Get all my mail folders"
→ Should list: INBOX, Sent, Drafts, etc.

"Search for unread emails"
→ Should return UIDs of unread mails

"Show me my 5 recent emails"
→ Should display last 5 mails with subjects

"Send test email to marco@triple-audio.nl"
→ Should succeed with message ID
```

---

## 🛠️ Troubleshooting

### Container won't start

```bash
docker logs strato-mail-mcp
# Check for:
# - IMAP_USER/PASSWORD error → Fix .env
# - Connection error → Check credentials
# - Module not found → npm install failed
```

### "Connection refused" to Strato

```
1. Test credentials work in Thunderbird/Outlook
2. Check: imap.strato.com:993 is accessible
3. Verify IMAP enabled in Strato account
```

### Claude doesn't see the tool

```
1. Check: docker ps | grep strato
   Should show: strato-mail-mcp RUNNING
2. Herstart Claude app completely
3. Check MCP settings JSON syntax (valid?)
```

---

## 📂 What's Running

```
Container: strato-mail-mcp
- Node.js process
- IMAP connection (persistent)
- SMTP session manager
- Attachment storage: /app/attachments (volume)
```

---

## 🚀 Now You Can

✅ Search 10,000+ mails in seconds  
✅ Read full email with attachments  
✅ Send emails from Claude  
✅ Manage folders, flags, drafts  
✅ Persistent attachment storage  
✅ Auto-restart on failure  

---

**That's it!** Enjoy your AI-powered mail client. 🎉
