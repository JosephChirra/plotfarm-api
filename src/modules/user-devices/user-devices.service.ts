import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateUserDeviceDto } from './dto/create-user-device.dto';
import { UpdateUserDeviceDto } from './dto/update-user-device.dto';

@Injectable()
export class UserDevicesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateUserDeviceDto) {
    return this.prisma.userDevice.create({ data: dto as never });
  }

  async findAll(userId?: string) {
    const where = userId ? { userId } : {};
    return this.prisma.userDevice.findMany({
      where,
      include: { user: true },
    });
  }

  async findOne(id: string) {
    const device = await this.prisma.userDevice.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!device) throw new NotFoundException('Device not found');
    return device;
  }

  async update(id: string, dto: UpdateUserDeviceDto) {
    await this.findOne(id);
    return this.prisma.userDevice.update({
      where: { id },
      data: dto as never,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.userDevice.delete({ where: { id } });
  }
}
