# Video Course Flutter App

A complete Flutter application that mirrors the web frontend and integrates with the existing Node.js backend.

## 🚀 Features

- **Authentication**: JWT-based auth with AWS Cognito integration
- **Course Management**: Browse and watch video courses
- **Video Player**: Custom video player with progress tracking
- **Gamification**: Points, levels, and achievements system
- **AI Integration**: Chat with Nova Pro AI assistant
- **Offline Support**: Hive-based caching for offline viewing
- **Dark Mode**: System and manual theme switching
- **Responsive Design**: Works on Android, iOS, and Web

## 🏗️ Architecture

```
lib/
├── core/                 # Core functionality
│   ├── di/              # Dependency injection
│   ├── network/         # API client & networking
│   ├── router/          # Navigation routing
│   ├── storage/         # Secure storage
│   └── theme/           # App theming
├── data/                # Data layer
│   ├── models/          # JSON models
│   ├── repositories/    # Repository implementations
│   └── services/        # External services
├── domain/              # Business logic
│   ├── entities/        # Domain entities
│   ├── repositories/    # Repository interfaces
│   └── usecases/        # Business use cases
└── presentation/        # UI layer
    ├── blocs/           # State management
    ├── pages/           # Screen widgets
    └── widgets/         # Reusable components
```

## 🛠️ Setup

1. **Install Dependencies**
   ```bash
   flutter pub get
   ```

2. **Generate Code**
   ```bash
   flutter packages pub run build_runner build
   ```

3. **Configure Environment**
   - Copy `.env.example` to `.env`
   - Update API endpoints and AWS Cognito settings

4. **Run the App**
   ```bash
   flutter run
   ```

## 📱 Supported Platforms

- ✅ Android (API 21+)
- ✅ iOS (iOS 11+)
- ✅ Web (Chrome, Safari, Firefox)

## 🔧 Configuration

### Environment Variables (.env)
```
API_BASE_URL=http://localhost:3002
COGNITO_USER_POOL_ID=us-east-1_vX8VZrTKQ
COGNITO_CLIENT_ID=4t7m43e0pvmvc2v7rfv72dv69j
COGNITO_IDENTITY_POOL_ID=us-east-1:50fe9a18-a4f5-4b30-80ad-63ebe6234278
AWS_REGION=us-east-1
```

### API Integration
The app integrates with these backend endpoints:
- `/api/auth/*` - Authentication
- `/api/courses/*` - Course management
- `/api/videos/*` - Video streaming
- `/api/gamification/*` - Points & achievements
- `/api/ai/*` - AI chat integration

## 🧪 Testing

### iOS Testing Setup

1. **Prerequisites**
   ```bash
   # Install Xcode from App Store
   # Install iOS Simulator
   xcode-select --install
   ```

2. **Run on iOS Simulator**
   ```bash
   # List available simulators
   flutter devices
   
   # Run on specific iOS simulator
   flutter run -d "iPhone 15 Pro"
   
   # Debug mode with hot reload
   flutter run --debug
   ```

3. **Physical iOS Device Testing**
   ```bash
   # Connect iPhone via USB
   # Enable Developer Mode in Settings > Privacy & Security
   # Trust computer when prompted
   
   flutter run -d "Your iPhone Name"
   ```

4. **iOS Build & Test**
   ```bash
   # Build for iOS
   flutter build ios --debug
   
   # Open in Xcode for advanced testing
   open ios/Runner.xcworkspace
   ```

### Unit & Widget Tests
```bash
# Unit tests
flutter test

# Integration tests
flutter test integration_test/

# Widget tests
flutter test test/widget_test.dart
```

## 📦 Build & Deploy

### Android
```bash
flutter build apk --release
flutter build appbundle --release
```

### iOS
```bash
flutter build ios --release
```

### Web
```bash
flutter build web --release
```

## 🔐 Security Features

- JWT token secure storage
- API request authentication
- Offline data encryption
- Secure video streaming URLs
- Input validation & sanitization

## 🎨 UI/UX Features

- Material Design 3
- Dark/Light theme support
- Responsive layouts
- Custom video player controls
- Pull-to-refresh functionality
- Infinite scroll pagination
- Loading states & error handling

## 📚 State Management

Uses BLoC pattern with:
- **AuthBloc**: User authentication state
- **CourseBloc**: Course data management
- **VideoBloc**: Video playback state
- **ThemeBloc**: App theme preferences

## 🔄 Offline Support

- Course data caching with Hive
- Video progress synchronization
- Offline video playback (cached)
- Background sync when online

## 🤖 AI Integration

- Nova Pro chat integration
- Context-aware responses
- Video-specific AI assistance
- SRT-based content analysis