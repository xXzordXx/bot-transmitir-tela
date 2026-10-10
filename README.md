# 📺 Bot Transmitir Tela (Discord)

Bot **oficial** do Discord que, com o comando `/transmitir`, cria uma **sala de
transmissão de tela** e envia o **link** no chat. Quem abre o link pode
**compartilhar a tela** e todos os outros **assistem ao vivo** pelo navegador.

É exatamente o esquema do vídeo: o bot não transmite nada dentro do Discord —
ele só manda um **link externo** onde a transmissão acontece.

✅ Bot oficial normal — **sem selfbot, sem risco de banimento, sem ffmpeg**.
✅ A captura de tela é feita pelo navegador (WebRTC / `getDisplayMedia`).

---

## Como funciona

```
Discord  --/transmitir-->  Bot  --manda link-->  https://.../sala/abc123
                                                         |
                         (transmissor abre o link e compartilha a tela)
                                                         |
                          WebRTC  <---- servidor faz a ponte ---->  (todos assistem)
```

- **1 pessoa transmite** (clica em "Compartilhar minha tela").
- **Vários assistem** abrindo o mesmo link.

---

## 1. Pré-requisitos

- **Node.js 20+** — <https://nodejs.org> (confira com `node -v`).
- Nada mais. (Não precisa de ffmpeg.)

---

## 2. Instalar

```bash
npm install
```

---

## 3. Criar o bot (Discord Developer Portal)

1. Acesse <https://discord.com/developers/applications> → **New Application**.
2. **General Information** → copie o **Application ID** → será o `CLIENT_ID`.
3. **Bot** → **Reset Token** → copie → será o `BOT_TOKEN`.
4. Não precisa ligar nenhum *Privileged Intent*.

---

## 4. Configurar o `.env`

Copie `.env.example` para `.env` e preencha:

```
BOT_TOKEN=...          # passo 3
CLIENT_ID=...          # passo 3
GUILD_ID=              # opcional: ID do seu servidor (comandos aparecem na hora)
PORT=3000
PUBLIC_URL=http://localhost:3000
```

---

## 5. Rodar

```bash
npm start
```

O terminal mostra o **link de convite do bot**. Abra-o e adicione o bot ao seu
servidor. Depois, no Discord, use:

```
/transmitir
```

O bot responde com o link da sala.

---

## 6. Usar a sala

- **Transmitir:** abra o link, clique em **📡 Compartilhar minha tela**, escolha
  a janela/tela e pronto.
- **Assistir:** é só abrir o mesmo link — a transmissão aparece sozinha.

---

## 7. ⚠️ Para funcionar com OUTRAS pessoas (fora do seu PC)

Em `http://localhost` só funciona na sua máquina. Para que **outras pessoas**
consigam entrar e, principalmente, para que o botão de compartilhar tela
funcione no navegador delas, o site precisa estar em **HTTPS** e acessível pela
internet. Duas formas fáceis:

### Opção A — Túnel rápido (para testar)
Com o `npm start` rodando, em outro terminal:

```bash
npx cloudflared tunnel --url http://localhost:3000
```

Isso te dá uma URL `https://...trycloudflare.com`. Coloque-a em `PUBLIC_URL`
no `.env`, reinicie o `npm start`, e os links do bot usarão essa URL.

> Alternativa: `ngrok http 3000`.

### Opção B — Hospedar
Suba o projeto em um servidor/VPS com HTTPS (Nginx + certificado, ou uma
plataforma como Railway/Render) e aponte `PUBLIC_URL` para o domínio.

> 🔎 **Sobre NAT/TURN:** o projeto usa um servidor STUN público do Google. Na
> maioria dos casos funciona. Em redes muito restritas, pode ser necessário um
> servidor **TURN** (ex.: `coturn`) para o vídeo passar — veja `src/sala.js`,
> variável `rtcConfig`, para adicionar um.

---

## 8. Estrutura do projeto

```
src/
  index.js     -> inicia servidor + bot
  bot.js       -> comando /transmitir (envia o link)
  server.js    -> site + sinalização WebRTC (WebSocket)
  rooms.js     -> salas em memória
  config.js    -> lê o .env
public/
  sala.html / sala.js -> página da sala (transmite e assiste)
  home.html / style.css
```

---

## 9. Problemas comuns

| Problema | Solução |
|---|---|
| Botão "Compartilhar tela" não faz nada | O site precisa estar em `localhost` ou **HTTPS** (passo 7). |
| Outras pessoas não conseguem assistir | Use um túnel/deploy e ajuste `PUBLIC_URL` (passo 7). |
| Comandos `/` não aparecem | Preencha `GUILD_ID` no `.env`, ou aguarde ~1h (global). |
| Vídeo não aparece em rede restrita | Pode faltar um servidor **TURN** (passo 7). |
| Tela preta ao compartilhar jogo | Jogos em tela cheia podem bloquear a captura; use em janela. |
