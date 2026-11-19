import { notFound } from "../../errors.js";
import { ClientsRepository, type DbClientUser } from "./repository.js";

export type ClientDto = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  active: boolean;
};

function toDto(db: DbClientUser): ClientDto {
  return {
    id: db.id,
    name: db.name,
    email: db.email,
    phone: db.phone,
    active: db.active,
  };
}

export class ClientsService {
  constructor(private repo = new ClientsRepository()) {}

  async list(includeInactive = false): Promise<ClientDto[]> {
    const list = await this.repo.list(includeInactive);
    return list.map(toDto);
  }

  async getById(id: string): Promise<ClientDto> {
    const client = await this.repo.findById(id);
    if (!client) {
      throw notFound("Cliente no encontrado.");
    }
    return toDto(client);
  }

  async update(
    id: string,
    data: { name?: string; phone?: string | null; active?: boolean },
  ): Promise<ClientDto> {
    const updated = await this.repo.update(id, data);
    if (!updated) {
      throw notFound("Cliente no encontrado.");
    }
    return toDto(updated);
  }
}
