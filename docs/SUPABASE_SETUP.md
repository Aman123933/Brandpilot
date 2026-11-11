# Supabase Setup Guide for BrandPilot

This guide explains how to connect BrandPilot to a free hosted PostgreSQL database on [Supabase](https://supabase.com).

---

## 1. Create a Free Supabase Project

1. Navigate to **[supabase.com](https://supabase.com)** and sign in (or create a free account).
2. Click **"New Project"**.
3. Choose an Organization (or create one).
4. Enter the project details:
   - **Name**: `brandpilot` (or any name you prefer)
   - **Database Password**: Choose a strong password and save it somewhere secure.
   - **Region**: Choose a region close to your deployment (e.g., `us-east-1` for Render Oregon, or `eu-central-1` / `ap-southeast-1`).
   - **Pricing Plan**: Select **Free tier** ($0/month).
5. Click **"Create new project"** and wait ~2 minutes for the database to provision.

---

## 2. Obtain Your PostgreSQL Connection String

1. In your Supabase project dashboard, open the left sidebar and click the **Settings (gear icon)** at the bottom.
2. Under **Project Settings**, select **Database**.
3. Scroll down to the **Connection string** section.
4. Select the **URI** tab.
5. You will see a connection string resembling:
   ```text
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxx.supabase.co:5432/postgres
   ```
   *(Or with Session / Transaction Pooler on port 6543 / 5432).*
6. Replace `[YOUR-PASSWORD]` with the actual database password you chose in Step 1.
7. Note: BrandPilot automatically ensures `sslmode=require` is present when connecting to Supabase hosts (`*.supabase.co`), and normalizes legacy `postgres://` prefixes to `postgresql://`.

---

## 3. Configure DATABASE_URL on Render

1. Open your **Render Dashboard** at [dashboard.render.com](https://dashboard.render.com).
2. Click on your BrandPilot web service (`brandpilot`).
3. In the left navigation, click **"Environment"**.
4. Click **"Add Environment Variable"**:
   - **Key**: `DATABASE_URL`
   - **Value**: Paste the full connection string from Step 2:
     ```text
     postgresql://postgres:YourActualPassword@db.xxxx.supabase.co:5432/postgres?sslmode=require
     ```
5. Click **"Save Changes"**.
6. Render will automatically trigger a new deployment with the database variable set.

---

## 4. Automatic Table Creation and Seeding

When BrandPilot starts with `DATABASE_URL` configured:
1. SQLAlchemy connects to PostgreSQL with `pool_pre_ping=True` and creates all required tables automatically.
2. The idempotent seeder initializes the organization, demo users (`Maya`, `Dev`, `Sana`), facts, guideline versions (Brand Git), and sample content assets.
3. The health check endpoint at `/health` will report:
   ```json
   {
     "status": "ok",
     "database": "connected",
     "database_engine": "postgresql",
     "ai": {
       "configured": true,
       "model": "gemini-3.8-flash"
     }
   }
   ```

---

## 5. Resetting the Database

To completely wipe and re-seed the PostgreSQL database:
Run the reset script locally with `DATABASE_URL` pointed to your Supabase instance:

```bash
DATABASE_URL="postgresql://postgres:YourPassword@db.xxxx.supabase.co:5432/postgres" python scripts/reset_db.py
```

Or via the authenticated admin endpoint:
```bash
curl -X POST https://your-brandpilot-url.onrender.com/admin/reset-demo \
  -H "Authorization: Bearer <MANAGER_JWT>"
```
