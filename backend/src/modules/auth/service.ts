import bcrypt from "bcryptjs";
import { emailTaken, invalidCredentials } from "../../errors.js";
import { createToken, type AuthUser } from "../../middleware/auth.js";
import { AuthRepository } from "./repository.js";

export class AuthService {
  constructor(private repo = new AuthRepository()) {}

  async register(data: {
    name: string;
    email: string;
    password: string;
    phone?: string | null;
  }): Promise<{ token: string; user: Omit<AuthUser, "active"> }> {
    const existing = await this.repo.findByEmail(data.email);
    if (existing) {
      throw emailTaken();
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await this.repo.createClient({
      name: data.name,
      email: data.email,
      passwordHash,
      phone: data.phone,
    });

    const token = createToken({ id: user.id, role: user.role });
    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    };
  }

  async login(data: {
    email: string;
    password: string;
  }): Promise<{ token: string; user: Omit<AuthUser, "active"> }> {
    const user = await this.repo.findByEmail(data.email);
    if (!user) {
      throw invalidCredentials();
    }

    if (!user.active) {
      throw invalidCredentials();
    }

    const match = await bcrypt.compare(data.password, user.password_hash);
    if (!match) {
      throw invalidCredentials();
    }

    const token = createToken({ id: user.id, role: user.role });
    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    };
  }
}
