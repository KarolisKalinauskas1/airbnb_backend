/**
 * Email Service Tests
 * 
 * This file contains tests for the email service functionality.
 */

const SimpleGmailService = require('./email.service');

// Mock nodemailer
jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
    verify: jest.fn().mockResolvedValue(true)
  })
}));

describe('Email Service', () => {
  beforeEach(() => {
    // Clear all mocks between tests
    jest.clearAllMocks();
  });

  // Test user object
  const testUser = {
    user_id: 1,
    full_name: 'Test User',
    email: 'test@example.com'
  };

  // Test booking object
  const testBooking = {
    booking_id: 123,
    start_date: new Date('2023-08-15'),
    end_date: new Date('2023-08-20'),
    total_price: 500,
    booking_status: 'confirmed',
    number_of_people: 2,
    camping_spot: {
      name: 'Test Camping Spot',
      address: '123 Test Street',
      city: 'Test City',
      owner: {
        full_name: 'Test Owner',
        email: 'owner@example.com'
      }
    }
  };

  // Test payment object
  const testPayment = {
    payment_id: 456,
    amount: 500,
    payment_date: new Date(),
    payment_method: 'credit_card',
    transaction_id: 'tx_123456',
    booking_id: 123
  };

  test('sendWelcomeEmail should send email with correct parameters', async () => {
    // Act
    await SimpleGmailService.sendWelcomeEmail(testUser);

    // Get the mock
    const nodemailerMock = require('nodemailer');
    const sendMailMock = nodemailerMock.createTransport().sendMail;

    // Assert
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: testUser.email,
        subject: expect.stringContaining('Welcome'),
        text: expect.stringContaining(testUser.full_name),
        html: expect.stringContaining(testUser.full_name)
      })
    );
  });

  test('sendBookingConfirmationEmail should send email with booking details', async () => {
    // Act
    await SimpleGmailService.sendBookingConfirmationEmail(testUser, testBooking);

    // Get the mock
    const nodemailerMock = require('nodemailer');
    const sendMailMock = nodemailerMock.createTransport().sendMail;

    // Assert
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: testUser.email,
        subject: expect.stringContaining('Booking Confirmation'),
        text: expect.stringContaining(testBooking.camping_spot.name),
        html: expect.stringContaining(testBooking.camping_spot.name)
      })
    );
  });

  test('sendBookingCancellationEmail should send email with cancellation details', async () => {
    // Act
    await SimpleGmailService.sendBookingCancellationEmail(testUser, testBooking);

    // Get the mock
    const nodemailerMock = require('nodemailer');
    const sendMailMock = nodemailerMock.createTransport().sendMail;

    // Assert
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: testUser.email,
        subject: expect.stringContaining('Cancellation'),
        text: expect.stringContaining(testBooking.camping_spot.name),
        html: expect.stringContaining(testBooking.camping_spot.name)
      })
    );
  });

  test('sendBookingUpdateEmail should send email with update details', async () => {
    // Act
    await SimpleGmailService.sendBookingUpdateEmail(testUser, testBooking);

    // Get the mock
    const nodemailerMock = require('nodemailer');
    const sendMailMock = nodemailerMock.createTransport().sendMail;

    // Assert
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: testUser.email,
        subject: expect.stringContaining('Update'),
        text: expect.stringContaining(testBooking.camping_spot.name),
        html: expect.stringContaining(testBooking.camping_spot.name)
      })
    );
  });

  test('sendPaymentConfirmationEmail should send email with payment details', async () => {
    // Act
    await SimpleGmailService.sendPaymentConfirmationEmail(testUser, testBooking, testPayment);

    // Get the mock
    const nodemailerMock = require('nodemailer');
    const sendMailMock = nodemailerMock.createTransport().sendMail;

    // Assert
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: testUser.email,
        subject: expect.stringContaining('Payment'),
        text: expect.stringContaining(testPayment.amount.toString()),
        html: expect.stringContaining(testPayment.amount.toString())
      })
    );
  });

  test('sendBookingReminderEmail should send email with reminder details', async () => {
    // Act
    await SimpleGmailService.sendBookingReminderEmail(testUser, testBooking);

    // Get the mock
    const nodemailerMock = require('nodemailer');
    const sendMailMock = nodemailerMock.createTransport().sendMail;

    // Assert
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: testUser.email,
        subject: expect.stringContaining('Reminder'),
        text: expect.stringContaining(testBooking.camping_spot.name),
        html: expect.stringContaining(testBooking.camping_spot.name)
      })
    );
  });
});
