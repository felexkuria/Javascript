# iOS Testing Guide

## 🍎 Quick iOS Testing Steps

### 1. Setup (One-time)
```bash
# Ensure Flutter iOS toolchain is ready
flutter doctor

# Should show ✓ for Xcode and iOS toolchain
```

### 2. iOS Simulator Testing
```bash
# Start iOS Simulator
open -a Simulator

# Run app on simulator
cd flutter_app
flutter run
```

### 3. Physical iPhone Testing
```bash
# Connect iPhone via Lightning/USB-C cable
# Enable Developer Mode: Settings > Privacy & Security > Developer Mode
# Trust computer when prompted

# Run on connected device
flutter run
```

### 4. Network Configuration for Local Backend

**For iOS Simulator:**
- Backend URL: `http://localhost:3002` ✅ (works directly)

**For Physical iPhone:**
- Find your Mac's IP: `ifconfig | grep "inet " | grep -v 127.0.0.1`
- Update `.env`: `API_BASE_URL=http://192.168.1.XXX:3002`
- Ensure backend runs on `0.0.0.0`: `app.listen(3002, '0.0.0.0')`

### 5. Common iOS Testing Commands
```bash
# List all available devices
flutter devices

# Run on specific device
flutter run -d "iPhone 15 Pro"
flutter run -d "Your iPhone Name"

# Hot reload during development
# Press 'r' in terminal or Cmd+S in IDE

# Hot restart
# Press 'R' in terminal or Cmd+Shift+S in IDE

# Debug mode with verbose logging
flutter run --debug --verbose
```

### 6. iOS-Specific Features to Test
- [ ] Authentication flow
- [ ] Video playback (AVPlayer integration)
- [ ] Background app refresh
- [ ] Push notifications (if implemented)
- [ ] Dark/Light mode switching
- [ ] Secure storage (Keychain)
- [ ] Network connectivity changes
- [ ] App lifecycle (background/foreground)

### 7. Performance Testing
```bash
# Profile mode for performance testing
flutter run --profile

# Release mode for final testing
flutter run --release
```

### 8. Troubleshooting

**"No devices found":**
```bash
flutter doctor -v
# Check iOS toolchain issues
```

**"Could not connect to device":**
- Restart iPhone
- Restart Xcode
- Re-trust computer
- Check USB cable

**Network issues on device:**
- Use Mac's IP instead of localhost
- Check firewall settings
- Ensure backend accepts external connections