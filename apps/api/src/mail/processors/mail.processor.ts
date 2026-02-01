import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  MAIL_QUEUE_NAME,
  JOB_VERIFICATION_EMAIL,
  JOB_PASSWORD_RESET_EMAIL,
} from '../../constants';
import {
  MailService,
  SendVerificationEmailPayload,
  SendPasswordResetEmailPayload,
} from '../mail.service';

@Processor(MAIL_QUEUE_NAME)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private readonly mailService: MailService) {
    super();
  }

  async process(
    job: Job<
      SendVerificationEmailPayload | SendPasswordResetEmailPayload,
      void,
      string
    >,
  ): Promise<void> {
    switch (job.name) {
      case JOB_VERIFICATION_EMAIL:
        await this.mailService.sendVerificationEmail(
          job.data as SendVerificationEmailPayload,
        );
        this.logger.log(`Sent verification email to ${job.data.to}`);
        break;
      case JOB_PASSWORD_RESET_EMAIL:
        await this.mailService.sendPasswordResetEmail(
          job.data as SendPasswordResetEmailPayload,
        );
        this.logger.log(`Sent password reset email to ${job.data.to}`);
        break;
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }
}
