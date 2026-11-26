import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreatePropertyLocationDto } from './dto/create-property-location.dto';
import { UpdatePropertyLocationDto } from './dto/update-property-location.dto';

@Injectable()
export class PropertyLocationsService {
  constructor(private prisma: PrismaService) { }

  private toPrismaLocationData(dto: CreatePropertyLocationDto | UpdatePropertyLocationDto) {
    const { placeId, formattedAddress, ...rest } = dto;
    return {
      ...rest,
      ...(placeId !== undefined ? { place_id: placeId } : {}),
      ...(formattedAddress !== undefined ? { formatted_address: formattedAddress } : {}),
    };
  }

  async create(dto: CreatePropertyLocationDto) {
    const existing = await this.prisma.propertyLocation.findUnique({
      where: { propertyId: dto.propertyId },
    });
    if (existing) throw new ConflictException('Location already exists for this property');
    return this.prisma.propertyLocation.create({
      data: this.toPrismaLocationData(dto) as never,
      include: { property: true },
    });
  }

  async findAll() {
    return this.prisma.propertyLocation.findMany({ include: { property: true } });
  }

  async findDistinctStates(): Promise<string[]> {
    const rows = await this.prisma.propertyLocation.groupBy({
      by: ['state'],
      where: { state: { not: null } },
      orderBy: { state: 'asc' },
    });
    return rows.map((r: any) => r.state as string).filter(Boolean);
  }

  async findDistinctDistricts(state?: string): Promise<string[]> {
    const rows = await this.prisma.propertyLocation.groupBy({
      by: ['district'],
      where: {
        district: { not: null },
        ...(state ? { state: { equals: state, mode: 'insensitive' } } : {}),
      },
      orderBy: { district: 'asc' },
    });
    return rows.map((r: any) => r.district as string).filter(Boolean);
  }

  async findDistinctMandals(district?: string): Promise<string[]> {
    const rows = await this.prisma.propertyLocation.groupBy({
      by: ['mandal'],
      where: {
        mandal: { not: null },
        ...(district ? { district: { equals: district, mode: 'insensitive' } } : {}),
      },
      orderBy: { mandal: 'asc' },
    });
    return rows.map((r: any) => r.mandal as string).filter(Boolean);
  }

  async findDistinctVillages(mandal?: string): Promise<string[]> {
    const rows = await this.prisma.propertyLocation.groupBy({
      by: ['village'],
      where: {
        village: { not: null },
        ...(mandal ? { mandal: { equals: mandal, mode: 'insensitive' } } : {}),
      },
      orderBy: { village: 'asc' },
    });
    return rows.map((r: any) => r.village as string).filter(Boolean);
  }

  async findOne(id: string) {
    const loc = await this.prisma.propertyLocation.findUnique({
      where: { id },
      include: { property: true },
    });
    if (!loc) throw new NotFoundException('Property location not found');
    return loc;
  }

  async findByPropertyId(propertyId: string) {
    const loc = await this.prisma.propertyLocation.findUnique({
      where: { propertyId },
      include: { property: true },
    });
    if (!loc) throw new NotFoundException('Property location not found');
    return loc;
  }

  async update(id: string, dto: UpdatePropertyLocationDto) {
    await this.findOne(id);
    return this.prisma.propertyLocation.update({
      where: { id },
      data: this.toPrismaLocationData(dto) as never,
      include: { property: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.propertyLocation.delete({ where: { id } });
  }
}
