# MoreBites Drivers (Expo)

Mobile app for delivery drivers. Talks to the Laravel API in `morebites-backend`.

## Setup

1. Start MySQL and the backend:

```bash
cd ../morebites-backend
php artisan migrate --seed
php artisan serve
```

2. Install and run the drivers app:

```bash
cd ../morebites-drivers
npm install
npx expo start
```

3. Optional: set API URL in `.env` (created for you):

```env
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000/api
```

On a physical phone with Expo Go, use your PC's LAN IP instead, e.g. `http://192.168.1.10:8000/api`.  
If `EXPO_PUBLIC_API_URL` is empty, the app tries to use the Expo host IP automatically.

## Test login

After seeding:

- Phone: `09123456789`
- Password: `driver123`

Seed creates one assigned demo order for that driver.

## API used

- `POST /api/driver/login`
- `GET /api/driver/orders`
- `GET /api/driver/orders/{id}`
- `PATCH /api/driver/orders/{id}/status`
- `POST /api/logout`
