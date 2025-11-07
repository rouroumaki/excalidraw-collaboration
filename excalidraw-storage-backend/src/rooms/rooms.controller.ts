import {
  Body,
  Controller,
  Get,
  Header,
  Logger,
  NotFoundException,
  Param,
  Put,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { StorageNamespace, StorageService } from 'src/storage/storage.service';
import { Readable } from 'stream';

@Controller('rooms')
export class RoomsController {
  private readonly logger = new Logger(RoomsController.name);
  namespace = StorageNamespace.ROOMS;

  constructor(private storageService: StorageService) {}

  @Get(':id')
  @Header('content-type', 'application/octet-stream')
  async findOne(@Param() params, @Res() res: Response): Promise<void> {
    const data = await this.storageService.get(params.id, this.namespace);
    this.logger.debug(`Get room ${params.id}`);

    if (!data) {
      throw new NotFoundException();
    }

    const stream = new Readable();
    stream.push(data);
    stream.push(null);
    stream.pipe(res);
  }

  @Put(':id')
  async create(@Param() params, @Body() payload: Buffer) {
    const id = params.id;
    await this.storageService.set(id, payload, this.namespace);
    this.logger.debug(`Created room ${id}`);

    return {
      id,
    };
  }

  @Get(':id/key')
  async getRoomKey(@Param() params): Promise<{ key: string } | null> {
    const roomId = params.id;
    this.logger.debug(`Get room key for ${roomId}`);

    const roomKey = await this.storageService.getRoomKey(roomId);
    if (!roomKey) {
      throw new NotFoundException(`Room key not found for room ${roomId}`);
    }

    return {
      key: roomKey,
    };
  }

  @Put(':id/key')
  async setRoomKey(
    @Param() params,
    @Body() body: { key: string },
  ): Promise<{ id: string }> {
    const roomId = params.id;
    const roomKey = body.key;

    if (!roomKey) {
      throw new Error('Room key is required');
    }

    await this.storageService.setRoomKey(roomId, roomKey);
    this.logger.debug(`Set room key for ${roomId}`);

    return {
      id: roomId,
    };
  }
}
