# ExpiCare

Smart Expiry Management System — MCA minor-project web app with a responsive React interface, empty-by-default inventory, and an Express/Mongoose API starter.

## Run the frontend

Install Node.js 20 or newer, then open a terminal in this folder and run:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`). The app works without MongoDB: your products and changes are saved in the browser's local storage. The inventory starts empty.

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

## Deploy to GitHub Pages

The included GitHub Actions workflow builds the Vite frontend and deploys `dist` whenever you push to `main`. In the repository that should host the app, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**. The app uses relative asset paths, so it works under a repository URL such as `https://mishraaryan.github.io/expicare/`.

GitHub Pages hosts only the frontend; the optional Express/MongoDB API still needs a separate server host before the UI can use it. The current demo continues to save data in browser storage.

## Included features

- Branded opening splash screen and in-app logo
- Dashboard summary, expiry overview, and upcoming products
- Add, search, filter, sort, view, edit, and delete products
- OCR scan from a package photo to suggest the product name and expiry date; review and correct both before saving
- Separate live scanner: supported browsers read product barcodes and look up catalogue details through Open Food Facts; OCR reads the expiry label
- Categories, reminder preferences, photo upload, quantity, and storage location
- Recycle bin with restore and empty actions
- Light/dark mode and responsive mobile navigation
- MongoDB-ready product schema and Express API routes

## Review notes

- Browser storage reads are guarded so malformed saved JSON falls back to sample data.
- Product names and dates are validated before saving; text fields have length limits and uploaded photos are capped at 2 MB.
- OCR uses Tesseract.js in the browser. The image is processed locally; the first scan needs internet access to fetch the OCR language data. OCR guesses should be checked against the package before saving.
- Barcode lookup needs internet and a browser with camera and `BarcodeDetector` support. Product name, brand, category, and quantity depend on catalogue coverage; expiry dates are read separately from the package label or entered manually. The barcode number is sent to Open Food Facts; label photos stay in the browser.
- API updates allow-list editable fields, validate Mongoose updates, return 404s for missing records, and use soft deletes until permanent removal.
- This project is a local demo starter, not a production account system. The Express API has no authentication or per-user data isolation yet; add those before exposing it publicly.
