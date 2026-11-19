import { notFound, validationError } from "../../errors.js";
import { ServicesRepository, type DbService } from "./repository.js";

export type ServiceDto = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  priceCents: number;
  active: boolean;
};

function toDto(db: DbService): ServiceDto {
  return {
    id: db.id,
    name: db.name,
    description: db.description,
    durationMinutes: db.duration_minutes,
    priceCents: db.price_cents,
    active: db.active,
  };
}

export class ServicesService {
  constructor(private repo = new ServicesRepository()) {}

  async list(includeInactive = false): Promise<ServiceDto[]> {
    const list = await this.repo.list(includeInactive);
    return list.map(toDto);
  }

  async getById(id: string): Promise<ServiceDto> {
    const s = await this.repo.findById(id);
    if (!s) throw notFound("Servicio no encontrado.");
    return toDto(s);
  }

  async create(data: {
    name: string;
    description?: string;
    durationMinutes: number;
    priceCents: number;
  }): Promise<ServiceDto> {
    if (data.durationMinutes % 15 !== 0) {
      throw validationError("La duración debe ser múltiplo de 15 minutos.");
    }
    const created = await this.repo.create({
      name: data.name,
      description: data.description || "",
      durationMinutes: data.durationMinutes,
      priceCents: data.priceCents,
    });
    return toDto(created);
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      durationMinutes?: number;
      priceCents?: number;
      active?: boolean;
    },
  ): Promise<ServiceDto> {
    if (data.durationMinutes !== undefined && data.durationMinutes % 15 !== 0) {
      throw validationError("La duración debe ser múltiplo de 15 minutos.");
    }
    const updated = await this.repo.update(id, data);
    if (!updated) {
      throw notFound("Servicio no encontrado.");
    }
    return toDto(updated);
  }
}
