# Vinterdöd

A survival horror web game.

## 🛠️ Prerequisites

To run this project, you will need to clean install the following software:

1.  **Install Git**
    *   Essential for downloading the code.
    *   [Download Git](https://git-scm.com/downloads)

2.  **Install Google Antigravity**
    *   Required for AI-assisted development (if applicable).
    *   [Download Antigravity](https://antigravity.google/download)

3.  **Install Node.js**
    *   Required to run the game server. Download the **LTS** version.
    *   [Download Node.js](https://nodejs.org/en/download/)

---

## 🚀 Installation Guide

Follow these steps to get the game running on your machine.

### 1. Open Terminal
Open **PowerShell** or **Command Prompt** (or your preferred terminal).

### 2. Clone the Repository
Download the game code to your computer.
```bash
git clone https://github.com/sibbor/winterdeath.git
```

### 3. Enter the Project Folder
Move into the folder you just downloaded.
```bash
cd winterdeath
```

### 4. Install Dependencies
Download all the libraries the game needs to work. This might take a minute.
```bash
npm install
```

---

## 🎮 How to Play

### Start Development Server
This runs the game locally on your machine.
```bash
npm run dev
```
> After running the command, open your browser and go to: `http://localhost:5173` (or the URL shown in your terminal).

### Build for Production
To create a finalized version of the game files for publishing:
```bash
npm run build
```
