import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';

import '../../presentation/pages/login_page.dart';
// Pages are defined inline below

part 'app_router.gr.dart';

@AutoRouterConfig()
class AppRouter extends _$AppRouter {
  @override
  List<AutoRoute> get routes => [
    // Login route
    AutoRoute(
      page: LoginRoute.page,
      path: '/login',
      initial: true,
    ),
    
    // Dashboard route
    AutoRoute(
      page: DashboardRoute.page,
      path: '/dashboard',
    ),
    
    // Course route
    AutoRoute(
      page: CourseRoute.page,
      path: '/course/:courseName',
    ),
    
    // Video route
    AutoRoute(
      page: VideoRoute.page,
      path: '/video/:courseName/:videoId',
    ),
  ];
}

@RoutePage(name: 'DashboardRoute')
class DashboardPage extends StatelessWidget {
  const DashboardPage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: Text('Dashboard')),
    );
  }
}

@RoutePage(name: 'CourseRoute')
class CoursePage extends StatelessWidget {
  final String courseName;
  
  const CoursePage({Key? key, required this.courseName}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(courseName)),
      body: Center(child: Text('Course: $courseName')),
    );
  }
}

@RoutePage(name: 'VideoRoute')
class VideoPage extends StatelessWidget {
  final String courseName;
  final String videoId;
  
  const VideoPage({Key? key, required this.courseName, required this.videoId}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Video Player')),
      body: Center(child: Text('Video: $videoId in $courseName')),
    );
  }
}