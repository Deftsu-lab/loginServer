const express = require("express");
const router = express.Router();

// mongodb user model
const User = require("./../models/User");

// mongodb user verification model
const UserVerification = require("./../models/UserVerification");

// mongodb password reset model
const PasswordReset = require("./../models/PasswordReset");

// Password handler
const bcrypt = require("bcrypt");

//email stuff
const nodemailer = require("nodemailer");

//unique string
const { v4: uuidv4 } = require("uuid");

//env variables
require("dotenv").config({
	path: "C:/Users/benlu/Desktop/Plugged/login_server/.env",
});

//path for static verified page
const path = require("path");
const { error } = require("console");

//nodemailer stuff

let transporter = nodemailer.createTransport({
	service: "outlook",
	auth: {
		user: process.env.AUTH_EMAIL,
		pass: process.env.AUTH_PASS,
	},
});

//testing success
transporter.verify((error, success) => {
	if (error) {
		console.log(error);
	} else {
		console.log("Ready for message");
		console.log(success);
	}
});

// Signup
router.post("/signup", (req, res) => {
	let { name, email, password, dateOfBirth } = req.body;

	if (name == "" || email == "" || password == "" || dateOfBirth == "") {
		res.json({
			status: "FAILED",
			message: "Empty input fields!",
		});
	} else if (!/^[a-zA-Z ]*$/.test(name)) {
		res.json({
			status: "FAILED",
			message: "Invalid name entered",
		});
	} else if (!/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
		res.json({
			status: "FAILED",
			message: "Invalid email entered",
		});
	} else if (password.length < 8) {
		res.json({
			status: "FAILED",
			message: "Password is too short!",
		});
	} else {
		// Checking if user already exists
		User.find({ email })
			.then((result) => {
				if (result.length) {
					// A user already exists
					res.json({
						status: "FAILED",
						message: "User with the provided email already exists",
					});
				} else {
					// Try to create new user

					// password handling
					const saltRounds = 10;
					bcrypt
						.hash(password, saltRounds)
						.then((hashedPassword) => {
							const newUser = new User({
								name,
								email,
								password: hashedPassword,
								verified: false,
							});

							newUser
								.save()
								.then((result) => {
									//handle account verification
									sendVerificationEmail(result, res);
								})
								.catch((err) => {
									res.json({
										status: "FAILED",
										message: "An error occurred while saving user account!",
									});
								});
						})
						.catch((err) => {
							res.json({
								status: "FAILED",
								message: "An error occurred while hashing password!",
							});
						});
				}
			})
			.catch((err) => {
				console.log(err);
				res.json({
					status: "FAILED",
					message: "An error occurred while checking for existing user!",
				});
			});
	}
});

//send verify email
const sendVerificationEmail = ({ _id, email }, res) => {
	//url to be used in the email
	const currentUrl = "https://secure-depths-90020.herokuapp.com/";

	const uniqueString = uuidv4() + _id;

	//mail options
	const mailOptions = {
		from: process.env.AUTH_EMAIL,
		to: email,
		subject: "Verify your Email",
		html: `<p>Verify your email adress to complete the signup and login to your account.</p>
          <p><b>This link expires in 6 hours</b>.</p><p>Press <a href=${
						currentUrl + "user/verify/" + _id + "/" + uniqueString
					}>here</a> to proceed.</p>`,
	};

	// hash the uniqueString
	const saltRounds = 10;
	bcrypt
		.hash(uniqueString, saltRounds)
		.then((hasheduniqueString) => {
			const newVerification = new UserVerification({
				userId: _id,
				uniqueString: hasheduniqueString,
				createdAt: Date.now(),
				expiresAt: Date.now() + 21600000,
			});

			newVerification
				.save()
				.then(() => {
					transporter
						.sendMail(mailOptions)
						.then(() => {
							//email sent and verification record saved
							res.json({
								status: "PENDING",
								message: "Email sent",
							});
						})
						.catch((error) => {
							console.log(error);
							res.json({
								status: "FAILED",
								message: "An error occurred while sending the mail!",
							});
						});
				})
				.catch((error) => {
					console.log(error);
					res.json({
						status: "FAILED",
						message: "Couldn't save the verification data",
					});
				});
		})
		.catch(() => {
			res.json({
				status: "FAILED",
				message: "An error has occurred while hashing the email data!",
			});
		});
};

//verify email
router.get("/verify/:userId/:uniqueString", (req, res) => {
	let { userId, uniqueString } = req.params;

	UserVerification.find({ userId })
		.then((result) => {
			if (result.length > 0) {
				//user verification exists so we proceed

				const { expiresAt } = result[0];
				const hasheduniqueString = result[0].uniqueString;

				//checking for expired unique string
				if (expiresAt < Date.now()) {
					//record has expired so we delete it
					UserVerification.deleteOne({ userId })
						.then((result) => {
							User.deleteOne({ _id: userId })
								.then(() => {
									let message = "Link has expired. Please sign up again.";
									res.redirect(`/user/verified/error=true&message=${message}`);
								})
								.catch((error) => {
									console.log(error);
									let message = "Clearing User with expired uniqueString failed";
									res.redirect(`/user/verified/error=true&message=${message}`);
								});
						})
						.catch((error) => {
							console.log(error);
							let message = "An error occurred while clearing expired user verification record";
							res.redirect(`/user/verified/error=true&message=${message}`);
						});
				} else {
					//valid record exists so we validate the user string
					//First compare the hashed unique string

					bcrypt
						.compare(uniqueString, hasheduniqueString)
						.then((result) => {
							if (result) {
								//strings match

								User.updateOne({ _id: userId }, { verified: true })
									.then(() => {
										UserVerification.deleteOne({ userId })
											.then(() => {
												res.sendFile(path.join(__dirname, "./../views/verified.html"));
											})
											.catch((error) => {
												console.log(error);
												let message = "Invalid verification details passed. Check your Inbox.";
												res.redirect(`/user/verified/error=true&message=${message}`);
											});
									})
									.catch((error) => {
										console.log(error);
										let message = "An Error occured while updating user record to show verified.";
										res.redirect(`/user/verified/error=true&message=${message}`);
									});
							} else {
								//existing record but incorrect verification details passed.
								let message = "Invalid verification details passed. Check your Inbox.";
								res.redirect(`/user/verified/error=true&message=${message}`);
							}
						})
						.catch((error) => {
							let message = "An error occurred while comparing the unique strings.";
							res.redirect(`/user/verified/error=true&message=${message}`);
						});
				}
			} else {
				//user verification record doesn't exist
				let message = "Account record doesn't exist or has been verified already. Please sign up or log in.";
				res.redirect(`/user/verified/error=true&message=${message}`);
			}
		})
		.catch((error) => {
			console.log(error);
			let message = "An error occurred while checking for existing user verification record";
			res.redirect(`/user/verified/error=true&message=${message}`);
		});
});

//Verified page route
router.get("/verified", (req, res) => {
	res.sendFile(path.join(__dirname, "./../views/verified.html"));
});

// Signin
router.post("/signin", (req, res) => {
	let { email, password } = req.body;
	email = email.trim();
	password = password.trim();

	if (email == "" || password == "") {
		res.json({
			status: "FAILED",
			message: "Empty credentials supplied",
		});
	} else {
		// Check if user exist
		User.find({ email })
			.then((data) => {
				if (data.length) {
					// User exists

					//check verification

					if (!data[0].verified) {
						res.json({
							status: "FAILED",
							message: "Email has not been verified yet! Please check your inbox.",
						});
					} else {
						const hashedPassword = data[0].password;
						bcrypt
							.compare(password, hashedPassword)
							.then((result) => {
								if (result) {
									// Password match
									res.json({
										status: "SUCCESS",
										message: "Signin successful",
										data: data,
									});
								} else {
									res.json({
										status: "FAILED",
										message: "Invalid password entered!",
									});
								}
							})
							.catch((err) => {
								res.json({
									status: "FAILED",
									message: "An error occurred while comparing passwords",
								});
							});
					}
				} else {
					res.json({
						status: "FAILED",
						message: "Invalid credentials entered!",
					});
				}
			})
			.catch((err) => {
				res.json({
					status: "FAILED",
					message: "An error occurred while checking for existing user",
				});
			});
	}
});

//password reset stuff
router.post("/requestPasswordReset", (req, res) => {
	const { email, redirectUrl } = req.body;

	User.find({ email })
		.then((data) => {
			if (data.length) {
				//user exists

				//checking if user is verifies

				if (!data[0].verified) {
					res.json({
						status: "FAILED",
						message: "Email has not been verified yet",
					});
				} else {
					//proceed with email reset password
					sendResetEmail(data[0], redirectUrl, res);
				}
			} else {
				res.json({
					status: "FAILED",
					message: "Account not found.",
				});
			}
		})
		.catch((error) => {
			console.log(error);
			res.json({
				status: "FAILED",
				message: "An error occurred while checking for existing user",
			});
		});
});

//send reset email
const sendResetEmail = ({ _id, email }, redirectUrl, res) => {
	const resetString = uuidv4() + _id;

	//First clear all existing reset records
	PasswordReset.deleteMany({ userId: _id })
		.then((result) => {
			//reset records deleted succesfully
			//Now we send the email

			//mail options
			const mailOptions = {
				from: process.env.AUTH_EMAIL,
				to: email,
				subject: "Password Reset",
				html: `<p>We heared that you lost your password.</p> <p>Don't worry, use the link below to reset it.</p>
          		<p><b>This link expires in 15 minutes</b>.</p><p>Please paste that link inside your browser.:${redirectUrl + "/" + _id + "/" + resetString}</p>`,
			};
			//hash the reset string
			const saltRounds = 10;
			bcrypt
				.hash(resetString, saltRounds)
				.then((hashedResetString) => {
					const newPasswordReset = new PasswordReset({
						userId: _id,
						resetString: hashedResetString,
						createdAt: Date.now(),
						expiresAt: Date.now() + 900000,
					});

					newPasswordReset
						.save()
						.then(() => {
							transporter
								.sendMail(mailOptions)
								.then(() => {
									//reset email sent and reset recrd has been saved
									res.json({
										status: "PENDING",
										message: "Password reset email sent.",
									});
								})
								.catch((error) => {
									console.log(error);
									res.json({
										status: "FAILED",
										message: "Reset email couldn't be send.",
									});
								});
						})
						.catch((error) => {
							console.log(error);
							res.json({
								status: "FAILED",
								message: "Couldn't save the new password.",
							});
						});
				})
				.catch((error) => {
					console.log(error);
					res.json({
						status: "FAILED",
						message: "Error while hashing the reset string.",
					});
				});
		})
		.catch((error) => {
			//error while clearing existing records
			console.log(error);
			res.json({
				status: "FAILED",
				message: "Clearing existing user records failed",
			});
		});
};

//Actually reset the password
router.post("/resetPassword", (req, res) => {
	let { userId, resetString, newPassword } = req.body;

	PasswordReset.find({ userId })
		.then((result) => {
			if (result.length > 0) {
				//password reset request exists so we proceed

				const { expiresAt } = result[0];
				const hashedResetString = result[0].resetString;

				//checking if the link expired
				if (expiresAt < Date.now()) {
					PasswordReset.deleteOne({ userId })
						.then(() => {
							//reset record deleted
							res.json({
								status: "FAILED",
								message: "Reset link has expired",
							});
						})
						.catch((error) => {
							console.log(error);
							res.json({
								status: "FAILED",
								message: "Clearing password reset record failed",
							});
						});
				} else {
					//valid record exists so we validate the reset string
					//First compare the hashed string

					bcrypt
						.compare(resetString, hashedResetString)
						.then((result) => {
							if (result) {
								//string matched
								//hash password again
								const saltRounds = 10;
								bcrypt
									.hash(newPassword, saltRounds)
									.then((hashedNewPassword) => {
										//update user password

										User.updateOne({ _id: userId }, { password: hashedNewPassword })
											.then(() => {
												//update complete now delete reset record
												PasswordReset.deleteOne({ userId })
													.then(() => {
														res.json({
															status: "SUCCES",
															message: "Password has been reset.",
														});
													})
													.catch((error) => {
														console.log(error);
														res.json({
															status: "FAILED",
															message: "An error occured finalizing password reset",
														});
													});
											})
											.catch((error) => {
												console.log(error);
												res.json({
													status: "FAILED",
													message: "Updating User password failed",
												});
											});
									})
									.catch((error) => {
										console.log(error);
										res.json({
											status: "FAILED",
											message: "An error occured while hashing new password.",
										});
									});
							} else {
								//existing record but incorrect result
								res.json({
									status: "FAILED",
									message: "Invalid password reset details passed.",
								});
							}
						})
						.catch((error) => {
							console.log(error);
							res.json({
								status: "FAILED",
								message: "Comparing password reset strings failed.",
							});
						});
				}
			} else {
				//password reset request doesn't exist
				res.json({
					status: "FAILED",
					message: "Password reset request not found.",
				});
			}
		})
		.catch((error) => {
			console.log(error);
			res.json({
				status: "FAILED",
				message: "Checking for existing password reset record failed.",
			});
		});
});

module.exports = router;
