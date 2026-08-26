# Deploying Callboard CRM to Render.com (with Supabase PostgreSQL)

Your Callboard application is configured with a hybrid database layer. 
- **Locally**: It uses a fast SQLite database (`callboard.db`) requiring no setup.
- **In the Cloud**: It connects to a persistent PostgreSQL cloud database (via a `DATABASE_URL` environment variable), enabling 100% free hosting and permanent data storage.

This guide details how to deploy the application utilizing Render.com (Free Web Service) and Supabase.com (Free PostgreSQL database).

---

## Step 1: Create a Free PostgreSQL Database on Supabase

1. Go to [Supabase.com](https://supabase.com) and sign up for a free account.
2. Click **New Project** and name it (e.g. `callboard-db`).
3. Set a strong database password (keep this password handy).
4. Wait a couple of minutes for your database to provision.
5. Once ready, go to **Project Settings** (gear icon) > **Database**.
6. Scroll down to **Connection string**, select the **URI** tab, and copy the connection string.
   - It will look like: `postgresql://postgres:[YOUR-PASSWORD]@db.xxxx.supabase.co:5432/postgres`
   - *Replace `[YOUR-PASSWORD]` with the database password you chose during project creation.*

---

## Step 2: Push Your Project to GitHub

Render deploys code directly from GitHub. Set up your repository:

1. Open your terminal in `C:\Users\Lenovo\.gemini\antigravity\scratch\callboard`.
2. Initialize git and commit your files:
   ```bash
   git init
   git add .
   git commit -m "Configure hybrid SQLite/PostgreSQL deployment"
   ```
3. Create a public or private repository on GitHub (e.g. `callboard-crm`) and link it:
   ```bash
   git remote add origin https://github.com/your-username/callboard-crm.git
   git branch -M main
   git push -u origin main
   ```

---

## Step 3: Deploy Free to Render.com

1. Go to [Render.com](https://render.com) and log in.
2. Click **New +** > **Web Service**.
3. Connect your GitHub repository.
4. Fill in the service details:
   - **Name**: `callboard-crm`
   - **Language/Runtime**: `Node`
   - **Instance Type**: `Free`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
5. Click **Advanced** at the bottom, then click **Add Environment Variable**:
   - **Key**: `DATABASE_URL`
   - **Value**: *Paste the Supabase URI string you copied in Step 1 (with your actual password filled in).*
6. Click **Create Web Service**.

Render will build and deploy your application. Once the deployment completes, Render will provide a public URL (e.g. `https://callboard-crm.onrender.com`). You and your teammate can access the CRM simultaneously, and all accounts, contacts, and logs will be permanently saved in the cloud.
