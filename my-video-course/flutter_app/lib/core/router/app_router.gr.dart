// GENERATED CODE - DO NOT MODIFY BY HAND

// **************************************************************************
// AutoRouterGenerator
// **************************************************************************

// ignore_for_file: type=lint
// coverage:ignore-file

part of 'app_router.dart';

abstract class _$AppRouter extends RootStackRouter {
  // ignore: unused_element
  _$AppRouter({super.navigatorKey});

  @override
  final Map<String, PageFactory> pagesMap = {
    CourseRoute.name: (routeData) {
      final args = routeData.argsAs<CourseRouteArgs>();
      return AutoRoutePage<dynamic>(
        routeData: routeData,
        child: CoursePage(
          key: args.key,
          courseName: args.courseName,
        ),
      );
    },
    DashboardRoute.name: (routeData) {
      return AutoRoutePage<dynamic>(
        routeData: routeData,
        child: const DashboardPage(),
      );
    },
    LoginRoute.name: (routeData) {
      return AutoRoutePage<dynamic>(
        routeData: routeData,
        child: const LoginPage(),
      );
    },
    VideoRoute.name: (routeData) {
      final args = routeData.argsAs<VideoRouteArgs>();
      return AutoRoutePage<dynamic>(
        routeData: routeData,
        child: VideoPage(
          key: args.key,
          courseName: args.courseName,
          videoId: args.videoId,
        ),
      );
    },
  };
}

/// generated route for
/// [CoursePage]
class CourseRoute extends PageRouteInfo<CourseRouteArgs> {
  CourseRoute({
    Key? key,
    required String courseName,
    List<PageRouteInfo>? children,
  }) : super(
          CourseRoute.name,
          args: CourseRouteArgs(
            key: key,
            courseName: courseName,
          ),
          initialChildren: children,
        );

  static const String name = 'CourseRoute';

  static const PageInfo<CourseRouteArgs> page = PageInfo<CourseRouteArgs>(name);
}

class CourseRouteArgs {
  const CourseRouteArgs({
    this.key,
    required this.courseName,
  });

  final Key? key;

  final String courseName;

  @override
  String toString() {
    return 'CourseRouteArgs{key: $key, courseName: $courseName}';
  }
}

/// generated route for
/// [DashboardPage]
class DashboardRoute extends PageRouteInfo<void> {
  const DashboardRoute({List<PageRouteInfo>? children})
      : super(
          DashboardRoute.name,
          initialChildren: children,
        );

  static const String name = 'DashboardRoute';

  static const PageInfo<void> page = PageInfo<void>(name);
}

/// generated route for
/// [LoginPage]
class LoginRoute extends PageRouteInfo<void> {
  const LoginRoute({List<PageRouteInfo>? children})
      : super(
          LoginRoute.name,
          initialChildren: children,
        );

  static const String name = 'LoginRoute';

  static const PageInfo<void> page = PageInfo<void>(name);
}

/// generated route for
/// [VideoPage]
class VideoRoute extends PageRouteInfo<VideoRouteArgs> {
  VideoRoute({
    Key? key,
    required String courseName,
    required String videoId,
    List<PageRouteInfo>? children,
  }) : super(
          VideoRoute.name,
          args: VideoRouteArgs(
            key: key,
            courseName: courseName,
            videoId: videoId,
          ),
          initialChildren: children,
        );

  static const String name = 'VideoRoute';

  static const PageInfo<VideoRouteArgs> page = PageInfo<VideoRouteArgs>(name);
}

class VideoRouteArgs {
  const VideoRouteArgs({
    this.key,
    required this.courseName,
    required this.videoId,
  });

  final Key? key;

  final String courseName;

  final String videoId;

  @override
  String toString() {
    return 'VideoRouteArgs{key: $key, courseName: $courseName, videoId: $videoId}';
  }
}
