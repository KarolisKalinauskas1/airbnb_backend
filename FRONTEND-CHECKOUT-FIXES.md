# Camping App Fixes - May 2025 Update

## Issues Fixed

1. **Checkout Session 500 Error**
   - **Problem**: The `/api/checkout/create-session` endpoint was returning 500 errors due to field mapping issues and missing required fields.
   - **Symptoms**: `camper_id`, `start_date`, `end_date`, and `total` were NaN or undefined.
   - **Fix**: Updated app.js to correctly map frontend field names to the backend field names and added better debugging for field values.

2. **Geocoding Permission Denied Error**
   - **Problem**: The geocoding cache was trying to write to `/app/data` directory which doesn't have write permissions on Railway.
   - **Symptoms**: `Failed to save geocoding cache: EACCES: permission denied, mkdir '/app/data'`
   - **Fix**: Modified geocoding utility to use `/tmp` directory when running on Railway, which is always writable in containerized environments.

3. **Frontend Authentication Redirection Issues**
   - **Problem**: Users were being redirected to auth page when trying to view camping spots, even though they should be public.
   - **Root Cause**: The `renterGuard` function in the router was not correctly handling paths with dynamic segments like `/camper/:id`.
   - **Fix**: 
     1. Updated frontend router to explicitly identify camper detail pages using route name and regex patterns
     2. Added specific checks for dynamic route segments with IDs
     3. Added more detailed logging to track redirections

## Technical Implementation Details

### 1. Checkout Session Fix

The issue was in the field mapping between frontend and backend. The frontend was sending:

```json
{
  "spotId": 28,
  "startDate": "2025-05-27",
  "endDate": "2025-05-30",
  "guests": 1,
  "baseAmount": 29.25,
  "serviceFee": 2.93,
  "totalAmount": 32.18
}
```

But the backend was trying to extract different field names:

```javascript
// Old code
const { campingSpotId, userId, checkIn, checkOut, guests, totalPrice } = req.body;
```

We fixed this by:
1. Using the exact field names from the frontend request
2. Ensuring proper type conversion with parseInt and parseFloat
3. Adding fallback calculation for total price if not provided

### 2. Geocoding Permission Fix

The geocoding cache was trying to save to a directory without permissions. We fixed this by:

1. Detecting when running on Railway using environment variables
2. Using the `/tmp` directory which is always writable in containerized environments
3. Setting proper file permissions when creating directories and files
4. Adding better error handling for cache operations

### 3. Frontend Router Fix

The frontend was redirecting users to authentication even for public pages, specifically for camper detail pages with dynamic IDs. We fixed this by:

1. Identifying camper detail pages using both route name and path pattern matching:
   ```javascript
   const isCamperDetailPage = to.name === 'camping-spot-detail' || 
                            to.name === 'CampingSpotDetail' ||
                            to.path.match(/^\/camper\/\d+/) || 
                            to.path.match(/^\/camping-spot\/\d+/);
   ```

2. Adding explicit checks for dynamic route segments
3. Adding logging to better track redirect decisions
4. Ensuring camper detail pages with IDs are always considered public

## Deployment Instructions

1. Run the deployment script:

```powershell
cd "c:\Users\kkaro\OneDrive - Thomas More\SecondYear2nd\Web Programming\airbnb_for_camping\airbnb_backend"
.\scripts\deploy-frontend-checkout-fix.ps1
```

2. After deployment, verify:
   - Camper pages load without redirecting to auth page
   - Checkout session works with proper field mapping
   - Geocoding no longer has permission issues
   - Review stats endpoint works without authentication

## Testing

After deployment, test the following scenarios:

1. **Anonymous User Flow**:
   - Visit the homepage without logging in
   - Browse camping spots
   - View camping spot details
   - Verify reviews load properly
   - Try to book (should redirect to login only at booking step)

2. **Checkout Flow**:
   - Log in as a regular user
   - Browse camping spots and select one
   - Set dates and number of guests
   - Click "Reserve now"
   - Verify you're redirected to Stripe checkout page

3. **Geocoding**:
   - View multiple camping spots with different locations
   - Verify maps load correctly
   - Check server logs for geocoding cache errors
