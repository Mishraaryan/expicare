# ExpiCare

Smart Expiry Management System — MCA minor-project web app with a responsive React interface, local demo data, and an Express/Mongoose API starter.

## Run the frontend

Install Node.js 20 or newer, then open a terminal in this folder and run:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`). The app works without MongoDB: sample products and changes are saved in the browser's local storage.

## Start the optional API

Copy `.env.example` to `.env`, set `MONGODB_URI` to a local or hosted MongoDB connection string, then run these commands in a second terminal:

```bash
npm run server
```

The API listens on `http://localhost:4000`. Available routes are `GET /api/health`, `GET /api/products`, `GET /api/products/:id`, `POST /api/products`, `PATCH /api/products/:id`, `DELETE /api/products/:id` (soft delete), `POST /api/products/:id/restore`, and `DELETE /api/products/:id/permanent`. The demo frontend currently uses local storage; connect it to these endpoints in `src/App.jsx` when you are ready to use the API.

## Build for deployment

```bash
npm run build
npm run preview
```

## Included features

- Branded opening splash screen and in-app logo
- Dashboard summary, expiry overview, and upcoming products
- Add, search, filter, sort, view, edit, and delete products
- Categories, reminder preferences, photo upload, quantity, and storage location
- Recycle bin with restore and empty actions
- Light/dark mode and responsive mobile navigation
- MongoDB-ready product schema and Express API routes

## Review notes

- Browser storage reads are guarded so malformed saved JSON falls back to sample data.
- Product names and dates are validated before saving; text fields have length limits and uploaded photos are capped at 2 MB.
- API updates allow-list editable fields, validate Mongoose updates, return 404s for missing records, and use soft deletes until permanent removal.
- This project is a local demo starter, not a production account system. The Express API has no authentication or per-user data isolation yet; add those before exposing it publicly.
