import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreatePropertyVerificationLogDto } from './dto/create-property-verification-log.dto';

@Injectable()
export class PropertyVerificationLogsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePropertyVerificationLogDto) {
    return this.prisma.propertyVerificationLog.create({
      data: dto as never,
      include: { property: true, verifiedBy: true },
    });
  }

  async findAll(propertyId?: string) {
    const where = propertyId ? { propertyId } : {};
    return this.prisma.propertyVerificationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: propertyId
        ? { verifiedBy: { select: { id: true, fullName: true, email: true } } }
        : { property: true, verifiedBy: true },
    });
  }

  async findOne(id: string) {
    const log = await this.prisma.propertyVerificationLog.findUnique({
      where: { id },
      include: { property: true, verifiedBy: true },
    });
    if (!log) throw new NotFoundException('Verification log not found');
    return log;
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.propertyVerificationLog.delete({ where: { id } });
  }
}
