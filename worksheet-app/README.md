# Pastry Quin Management System

A mobile-friendly cloud ledger that digitizes the Pastry Quin cake sales/profit worksheet.

## Included
- Private administrator sign-in through Supabase Auth.
- Cake orders with date, customer name, cake name/type, selling price and total production expense.
- Multiple separate payment transactions per order.
- Automatic total paid, balance, Paid / Partially Paid / Unpaid status and profit.
- Dashboard: total sales, expenses, profit, payments received and outstanding balances.
- Daily, weekly, monthly and yearly reports; CSV export.
- Monthly worksheet summary: Total Balance, Total Profit, To the Bank = Balance + Profit.
- Search by customer name. UGX display. Responsive interface.

## Setup
1. Create a Supabase project.
2. Run the complete `schema.sql` in Supabase SQL Editor.
3. In Supabase Authentication settings, disable public sign-ups.
4. Create your sole administrator in Authentication > Users using an email and password you choose. No credentials are hard-coded.
5. Open `index.html`; on first launch, enter the Supabase Project URL and anon/publishable key, then sign in.
6. Never place the Supabase service-role key in the browser.

## Deploy
The app is static. Deploy the `worksheet-app` directory to GitHub Pages, Netlify or Vercel, or serve `index.html` locally. Supabase supplies cloud persistence and authentication.

## Financial logic
- Total paid = sum of all payment rows.
- Balance = cake selling price - total paid.
- Profit = full selling price - production expense (not cash received less expense).
- Database trigger rejects payments above the remaining balance.
- Monthly To the Bank = monthly outstanding balances + monthly profit.

All data is protected by Supabase Auth and row-level security. Disable public sign-ups to retain the single-administrator access model.
