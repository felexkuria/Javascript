# Role Switching Test

## Current Implementation

1. **Login Page**: Has student/teacher tabs that set `selectedRole` variable
2. **Login Request**: Sends `requestedRole` in the request body
3. **Auth Controller**: 
   - Checks if user has the requested role
   - Sets `currentRole` in session based on requested role or user's highest role
   - Sets `isTeacher` flag based on roles array
4. **Dashboard Route**: 
   - Uses `sessionAuth` middleware to set `req.user` from session
   - Checks if user is teacher to show teacher dashboard
   - Falls back to student dashboard

## Expected Behavior

- **Student Tab + Login**: Should show student dashboard (regular dashboard.ejs)
- **Teacher Tab + Login**: Should show teacher dashboard (teacher-dashboard.ejs) if user has teacher role

## Test Steps

1. Go to `/login`
2. Click "Teacher" tab
3. Login with `multitouchkenya@gmail.com` (has teacher role)
4. Should redirect to `/dashboard` but render teacher-dashboard.ejs
5. Logout and login again with "Student" tab selected
6. Should redirect to `/dashboard` and render regular dashboard.ejs

## Current Status

✅ Login system working
✅ Role assignment working  
✅ Session creation working
✅ Teacher dashboard template exists
✅ Dashboard routing checks user roles

The system should now properly show different dashboards based on the selected role during login.