import 'package:get_it/get_it.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:hive/hive.dart';

import '../network/api_client.dart';
import '../storage/secure_storage.dart';
import '../../data/repositories/auth_repository_impl.dart';
import '../../data/repositories/course_repository_impl.dart';
import '../../domain/repositories/auth_repository.dart';
import '../../domain/repositories/course_repository.dart';
import '../../presentation/blocs/auth/auth_bloc.dart';
import '../../presentation/blocs/theme/theme_bloc.dart';
import '../router/app_router.dart';

final getIt = GetIt.instance;

Future<void> configureDependencies() async {
  // Core
  getIt.registerLazySingleton<Dio>(() => Dio());
  getIt.registerLazySingleton<FlutterSecureStorage>(() => const FlutterSecureStorage());
  getIt.registerLazySingleton<SecureStorage>(() => SecureStorage(getIt()));
  
  // Network
  getIt.registerLazySingleton<ApiClient>(() => ApiClient(getIt<Dio>()));
  
  // Repositories
  getIt.registerLazySingleton<AuthRepository>(() => AuthRepositoryImpl(getIt(), getIt()));
  getIt.registerLazySingleton<CourseRepository>(() => CourseRepositoryImpl(getIt()));
  
  // Blocs
  getIt.registerFactory<AuthBloc>(() => AuthBloc(getIt()));
  getIt.registerFactory<ThemeBloc>(() => ThemeBloc());
  
  // Router
  getIt.registerLazySingleton<AppRouter>(() => AppRouter());
  
  // Initialize Hive boxes
  await Hive.openBox('courses');
  await Hive.openBox('videos');
  await Hive.openBox('settings');
}