import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';

class ThemeEvent extends Equatable {
  @override
  List<Object> get props => [];
}

class ThemeToggled extends ThemeEvent {}

class ThemeState extends Equatable {
  final bool isDarkMode;

  const ThemeState({required this.isDarkMode});

  @override
  List<Object> get props => [isDarkMode];
}

class ThemeBloc extends Bloc<ThemeEvent, ThemeState> {
  ThemeBloc() : super(const ThemeState(isDarkMode: false)) {
    on<ThemeToggled>((event, emit) {
      emit(ThemeState(isDarkMode: !state.isDarkMode));
    });
  }
}