import { Module, forwardRef } from "@nestjs/common";
import { DeliveryModule } from "../delivery/delivery.module.js";
import { GeweModule } from "../gewe/gewe.module.js";
import { AudioTranscodeService } from "./audio-transcode.service.js";
import { MediaController } from "./media.controller.js";
import { MediaService } from "./media.service.js";

@Module({
  imports: [GeweModule, forwardRef(() => DeliveryModule)],
  controllers: [MediaController],
  providers: [AudioTranscodeService, MediaService],
  exports: [MediaService]
})
export class MediaModule {}
