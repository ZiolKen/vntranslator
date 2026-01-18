<br>
<p align="center">
<a href="https://vntranslator.pages.dev" target="_blank">
<img src="./assets/logo.jpeg" alt="VN Translator" height="250" width="250" style="border-radius: 16px;" />
</a>
</p>

# <p align="center">VN Translator</p>

<div>
  <img style="100%" src="https://capsule-render.vercel.app/api?type=waving&height=100&section=header&reversal=false&fontSize=70&fontColor=FFFFFF&fontAlign=50&fontAlignY=50&stroke=-&descSize=20&descAlign=50&descAlignY=50&theme=cobalt"  />
</div>

### <p align="center">Modern Web Toolkit for Translating Ren’Py & RPG Maker Games</p>

<p align="center">
  <img src="https://files.catbox.moe/9bk373.png" alt="VN Translator Banner" width="720">
</p>

<p align="center">
  <a href="https://vntranslator.vercel.app"><img src="https://img.shields.io/badge/Live-Vercel-6366f1?style=for-the-badge"></a>
  <a href="https://vntranslator.pages.dev"><img src="https://img.shields.io/badge/Live-Cloudflare-f97316?style=for-the-badge"></a>
  <a href="https://ziolken.github.io/vntranslator"><img src="https://img.shields.io/badge/Live-GitHub%20Pages-18181b?style=for-the-badge"></a>
</p>

<p align="center">
  <a href="https://github.com/ZiolKen/vntranslator/stargazers"><img src="https://img.shields.io/github/stars/ZiolKen/vntranslator?style=flat"></a>
  <a href="https://github.com/ZiolKen/vntranslator/blob/main/LICENSE"><img src="https://img.shields.io/github/license/ZiolKen/vntranslator?style=flat"></a>
  <a href="https://github.com/ZiolKen/vntranslator/forks"><img src="https://img.shields.io/github/forks/ZiolKen/vntranslator?style=flat"></a>
</p>

VN Translator is a **modern, browser-based translation toolkit** designed for **game developers, translators, and modders** working with **Ren’Py**, **RPG Maker**, **Kirikiri**, and **Tyranobuild** engines.

It focuses on **accuracy**, **format preservation**, and **ease of use**, without requiring local software installation.

---

## ✨ Features Overview

<p align="center">
  <img src="https://files.catbox.moe/7scfv7.png" width="48%">
  <img src="https://files.catbox.moe/dteqhf.png" width="48%">
</p>

### 🎮 Ren’Py Translator
- Translate `.rpy` files directly in the browser
- Preserve Ren’Py syntax, variables, and tags
- Safe placeholder protection

### 🕹️ RPG Maker JSON Translator
- Supports RPG Maker **MV / MZ**
- Intelligent dialog extraction
- Batch translation with pause & resume

### 🧰 RPGM Ultimate Tool
- Extract → translate → merge workflow
- Designed for large RPG Maker projects

### 📝 Game Text Editor
- Monaco Editor–powered
- Edit `.json`, `.rpy`, `.ks` files in browser

### 🔄 RPY Dialog Extractor
- Extract dialogs from Ren’Py scripts
- Merge translations back safely

### 🔁 KS Extractor (Kirikiri / Tyranobuild)
- Convert `.ks` → `.json`
- Merge translated `.json` back into `.ks`

---

## 🤖 Translation Backends

- **DeepSeek API** (recommended – high quality)
- **OpenAI (ChatGPT models)**
- **DeepL API**
- **Lingva / Google Translate** (free, lower quality)

---

## 📁 Project Structure

```
/
├─ index.html
├─ assets/
├─ renpy/
├─ rpgm/
├─ rpgmu/
├─ game-text-editor/
├─ api/
├─ functions/api/
```

---

## 🚀 Local Development

```bash
npx serve .
```

For full features with APIs:

```bash
npm install -g vercel
vercel dev
```

---

## 🔑 API Keys & Security

Some features require API keys:
- DeepSeek
- OpenAI
- DeepL

Never expose private API keys in client-side code.

---

## 📜 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## ❤️ Credits

Created and maintained by **[ZiolKen](https://github.com/ZiolKen)**.

---

## ☕ Support

If this project helps you:

[![BuyMeACoffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/_zkn) [![PayPal](https://img.shields.io/badge/PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white)](https://paypal.me/zkn0461) [![Patreon](https://img.shields.io/badge/Patreon-F96854?style=for-the-badge&logo=patreon&logoColor=white)](https://patreon.com/ZiolKen) 

---

## ⚠️ Disclaimer

All tools are provided **as-is**.  
Always back up your game files before using automated translation or merge features.

<div>
  <img style="100%" src="https://capsule-render.vercel.app/api?type=waving&height=100&section=footer&reversal=false&fontSize=70&fontColor=FFFFFF&fontAlign=50&fontAlignY=50&stroke=-&descSize=20&descAlign=50&descAlignY=50&theme=cobalt"  />
</div>