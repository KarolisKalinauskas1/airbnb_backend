-- CreateTable
CREATE TABLE `bookings` (
    `booking_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `camper_id` INTEGER NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `status_id` INTEGER NOT NULL,
    `number_of_guests` INTEGER NOT NULL,
    `cost` DECIMAL(10, 2) NOT NULL,
    `created_at` DATE NOT NULL,

    UNIQUE INDEX `booking_id_UNIQUE`(`booking_id`),
    INDEX `FK_booking_status_idx`(`status_id`),
    INDEX `FK_bookings_campers_idx`(`camper_id`),
    INDEX `FK_bookins_users_idx`(`user_id`),
    PRIMARY KEY (`booking_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `images` (
    `image_id` INTEGER NOT NULL AUTO_INCREMENT,
    `camping_id` INTEGER NOT NULL,
    `image_url` VARCHAR(45) NOT NULL,
    `created_at` DATE NOT NULL,

    UNIQUE INDEX `image_id_UNIQUE`(`image_id`),
    INDEX `FK_images_campings_idx`(`camping_id`),
    PRIMARY KEY (`image_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `user_id` INTEGER NOT NULL AUTO_INCREMENT,
    `full_name` VARCHAR(45) NOT NULL,
    `email` VARCHAR(45) NOT NULL,
    `password_hash` VARCHAR(45) NOT NULL,
    `phone_number` VARCHAR(45) NULL,
    `date_of_birth` VARCHAR(45) NOT NULL,
    `location_id` INTEGER NOT NULL,
    `verified` VARCHAR(45) NOT NULL,
    `isOwner` VARCHAR(1) NULL,
    `created_at` DATE NOT NULL,

    UNIQUE INDEX `email_UNIQUE`(`email`),
    UNIQUE INDEX `password_hash_UNIQUE`(`password_hash`),
    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `camping_spot` (
    `camping_spot_id` INTEGER NOT NULL AUTO_INCREMENT,
    `owner_id` INTEGER NOT NULL,
    `title` VARCHAR(45) NOT NULL,
    `description` VARCHAR(45) NOT NULL,
    `max_guests` INTEGER NOT NULL,
    `price_per_night` DECIMAL(10, 2) NOT NULL,
    `location_id` INTEGER NOT NULL,
    `created_at` DATETIME(0) NOT NULL,
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `camping_spot_id_UNIQUE`(`camping_spot_id`),
    INDEX `FK_camping_owner_idx`(`owner_id`),
    INDEX `FK_campings_location_idx`(`location_id`),
    PRIMARY KEY (`camping_spot_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `camping_spot_amenities` (
    `camping_spot_id` INTEGER NOT NULL,
    `amenity_id` INTEGER NOT NULL,

    INDEX `FK_images_to_campings_idx`(`amenity_id`),
    PRIMARY KEY (`camping_spot_id`, `amenity_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `country` (
    `country_id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(45) NOT NULL,

    UNIQUE INDEX `country_id_UNIQUE`(`country_id`),
    PRIMARY KEY (`country_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `owner` (
    `owner_id` INTEGER NOT NULL,
    `license` VARCHAR(45) NOT NULL,

    UNIQUE INDEX `owner_id_UNIQUE`(`owner_id`),
    PRIMARY KEY (`owner_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `amenity` (
    `amenity_id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(45) NOT NULL,

    UNIQUE INDEX `amenity_id_UNIQUE`(`amenity_id`),
    PRIMARY KEY (`amenity_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `location` (
    `location_id` INTEGER NOT NULL AUTO_INCREMENT,
    `address_line1` VARCHAR(45) NOT NULL,
    `address_line2` VARCHAR(45) NULL,
    `city` VARCHAR(45) NOT NULL,
    `country_id` INTEGER NOT NULL,
    `postal_code` VARCHAR(45) NOT NULL,
    `longtitute` VARCHAR(45) NOT NULL,
    `latitute` VARCHAR(45) NOT NULL,

    UNIQUE INDEX `location_id_UNIQUE`(`location_id`),
    INDEX `FK_location_country_idx`(`country_id`),
    PRIMARY KEY (`location_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `review` (
    `review_id` INTEGER NOT NULL AUTO_INCREMENT,
    `booking_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `rating` INTEGER NOT NULL,
    `comment` VARCHAR(45) NULL,
    `created_at` DATE NOT NULL,

    UNIQUE INDEX `review_id_UNIQUE`(`review_id`),
    UNIQUE INDEX `booking_id_UNIQUE`(`booking_id`),
    PRIMARY KEY (`review_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `status_booking_transaction` (
    `status_id` INTEGER NOT NULL AUTO_INCREMENT,
    `status` ENUM('declined', 'processing', 'accepted') NOT NULL,

    UNIQUE INDEX `status_id_UNIQUE`(`status_id`),
    PRIMARY KEY (`status_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transaction` (
    `transaction_id` INTEGER NOT NULL AUTO_INCREMENT,
    `amount` DECIMAL(10, 2) NOT NULL,
    `status_id` INTEGER NOT NULL,
    `booking_id` INTEGER NOT NULL,

    UNIQUE INDEX `transaction_id_UNIQUE`(`transaction_id`),
    INDEX `FK_transaction_booking_idx`(`booking_id`),
    INDEX `Fk_transaction_status_idx`(`status_id`),
    PRIMARY KEY (`transaction_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `FK_booking_review` FOREIGN KEY (`booking_id`) REFERENCES `review`(`booking_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `FK_booking_status` FOREIGN KEY (`status_id`) REFERENCES `status_booking_transaction`(`status_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `FK_bookings_campers` FOREIGN KEY (`camper_id`) REFERENCES `camping_spot`(`camping_spot_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `FK_bookins_users` FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `images` ADD CONSTRAINT `FK_images_campings` FOREIGN KEY (`camping_id`) REFERENCES `camping_spot`(`camping_spot_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `FK_user_owner` FOREIGN KEY (`user_id`) REFERENCES `owner`(`owner_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `camping_spot` ADD CONSTRAINT `FK_campers_location` FOREIGN KEY (`location_id`) REFERENCES `location`(`location_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `camping_spot` ADD CONSTRAINT `FK_campers_owners` FOREIGN KEY (`owner_id`) REFERENCES `owner`(`owner_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `camping_spot_amenities` ADD CONSTRAINT `FK_campings_to_images` FOREIGN KEY (`camping_spot_id`) REFERENCES `camping_spot`(`camping_spot_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `camping_spot_amenities` ADD CONSTRAINT `FK_images_to_campings` FOREIGN KEY (`amenity_id`) REFERENCES `amenity`(`amenity_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `location` ADD CONSTRAINT `FK_location_country` FOREIGN KEY (`country_id`) REFERENCES `country`(`country_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `transaction` ADD CONSTRAINT `FK_transaction_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`booking_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `transaction` ADD CONSTRAINT `Fk_transaction_status` FOREIGN KEY (`status_id`) REFERENCES `status_booking_transaction`(`status_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
