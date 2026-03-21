import '../../data/models/auth_models.dart';

abstract class AuthRepository {
  Future<UserModel> signIn(String email, String password);
  Future<UserModel> signUp(String email, String password, String name);
  Future<void> signOut();
  Future<UserModel?> getCurrentUser();
  Future<String?> getToken();
}