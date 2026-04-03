import { useState } from 'react';
import {
	Alert,
	Modal,
	Pressable,
	StyleSheet,
	TextInput,
	View,
	KeyboardAvoidingView,
	Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
	createUserWithEmailAndPassword,
	sendEmailVerification,
	signInWithEmailAndPassword,
	signOut,
} from 'firebase/auth';
import * as Location from 'expo-location';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { auth, db } from '@/src/services/firebaseClient';
import { getUserData, createUserAccount } from '@/src/services/userService';

export default function AuthScreen() {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [isCreateMode, setIsCreateMode] = useState(false);
	const [loading, setLoading] = useState(false);
	const [resending, setResending] = useState(false);
	const [profileModalVisible, setProfileModalVisible] = useState(false);
	const [profileFirstName, setProfileFirstName] = useState('');
	const [profileLastName, setProfileLastName] = useState('');
	const [profileRadius, setProfileRadius] = useState('5');
	const [profileHomeAddress, setProfileHomeAddress] = useState('');
	const [pendingEmail, setPendingEmail] = useState('');
	const [savingProfile, setSavingProfile] = useState(false);

	const handleAuth = async () => {
		if (!email.trim() || !password.trim()) {
			Alert.alert('Missing fields', 'Please enter email and password.');
			return;
		}

		setLoading(true);
		try {
			if (isCreateMode) {
				const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
				if (cred.user) {
					await sendEmailVerification(cred.user);
					Alert.alert('Verify your email', 'Verification email sent. Please verify, then log in.');
					await signOut(auth);
					setIsCreateMode(false);
				}
			} else {
				const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
				await cred.user.reload();

				if (!cred.user.emailVerified) {
					await signOut(auth);
					Alert.alert('Email not verified', 'Please verify your email before signing in.');
					return;
				}

				const account = await getUserData(db, cred.user.email ?? '');
				if (!account) {
					setPendingEmail(cred.user.email ?? '');
					setProfileFirstName('');
					setProfileLastName('');
					setProfileRadius('5');
					setProfileHomeAddress('');
					setProfileModalVisible(true);
					return;
				}

				router.replace('/(tabs)' as any);
			}
		} catch (error: any) {
			Alert.alert('Authentication failed', error?.message ?? 'Please try again.');
		} finally {
			setLoading(false);
		}
	};

	const handleSaveProfile = async () => {
		if (!profileFirstName.trim() || !profileLastName.trim() || !profileHomeAddress.trim()) {
			Alert.alert('Missing fields', 'Please enter first name, last name, and home address.');
			return;
		}

		setSavingProfile(true);
		try {
			const results = await Location.geocodeAsync(profileHomeAddress.trim());
			const firstMatch = results[0];

			if (!firstMatch) {
				Alert.alert('Address not found', 'Enter a complete home address so it can be saved as your map location.');
				return;
			}

			await createUserAccount(db, pendingEmail, {
				firstName: profileFirstName.trim(),
				lastName: profileLastName.trim(),
				radius: profileRadius.trim(),
				homeAddress: profileHomeAddress.trim(),
				location: {
					latitude: firstMatch.latitude,
					longitude: firstMatch.longitude,
				},
			});
			setProfileModalVisible(false);
			router.replace('/(tabs)' as any);
		} catch (error: any) {
			Alert.alert('Error', error?.message ?? 'Could not save profile information.');
		} finally {
			setSavingProfile(false);
		}
	};

	const handleCancelProfileSetup = async () => {
		setProfileModalVisible(false);
		setPendingEmail('');
		setProfileFirstName('');
		setProfileLastName('');
		setProfileRadius('5');
		setProfileHomeAddress('');
		await signOut(auth);
	};

	const handleResendVerification = async () => {
		if (!email.trim() || !password.trim()) {
			Alert.alert('Missing fields', 'Enter email and password, then resend verification.');
			return;
		}

		setResending(true);
		try {
			const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
			if (cred.user.emailVerified) {
				Alert.alert('Already verified', 'This account is already verified.');
			} else {
				await sendEmailVerification(cred.user);
				Alert.alert('Verification sent', 'A new verification email has been sent.');
			}
			await signOut(auth);
		} catch (error: any) {
			Alert.alert('Resend failed', error?.message ?? 'Please try again later.');
		} finally {
			setResending(false);
		}
	};

	return (
		<SafeAreaView style={styles.safeArea}>
			<KeyboardAvoidingView
				style={styles.container}
				behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
				<View style={styles.card}>
					<ThemedText style={styles.title}>{isCreateMode ? 'Create account' : 'Sign in'}</ThemedText>
					<ThemedText style={styles.subtitle}>Use email and password. Email verification is required.</ThemedText>

					<TextInput
						style={styles.input}
						placeholder="Email"
						autoCapitalize="none"
						keyboardType="email-address"
						value={email}
						onChangeText={setEmail}
					/>
					<TextInput
						style={styles.input}
						placeholder="Password"
						secureTextEntry
						value={password}
						onChangeText={setPassword}
					/>

					<Pressable style={styles.primaryButton} onPress={handleAuth} disabled={loading}>
						<ThemedText style={styles.primaryText}>{loading ? 'Please wait...' : isCreateMode ? 'Create Account' : 'Sign In'}</ThemedText>
					</Pressable>

					{!isCreateMode && (
						<Pressable style={styles.secondaryButton} onPress={handleResendVerification} disabled={loading || resending}>
							<ThemedText style={styles.secondaryText}>{resending ? 'Sending...' : 'Resend verification email'}</ThemedText>
						</Pressable>
					)}

					<Pressable
						onPress={() => setIsCreateMode((prev) => !prev)}
						disabled={loading}
						style={styles.linkButton}>
						<ThemedText style={styles.linkText}>
							{isCreateMode ? 'Already have an account? Sign in' : 'Need an account? Create one'}
						</ThemedText>
					</Pressable>
				</View>
			</KeyboardAvoidingView>

			<Modal animationType="slide" transparent={true} visible={profileModalVisible} onRequestClose={handleCancelProfileSetup}>
				<View style={styles.modalOverlay}>
					<View style={styles.modalContent}>
						<ThemedText type="title" style={styles.modalTitle}>Complete Profile</ThemedText>
						<ThemedText style={styles.modalSubtitle}>Enter your home address so the app can save your default map location.</ThemedText>
						<TextInput style={styles.input} value={profileFirstName} onChangeText={setProfileFirstName} placeholder="First Name" />
						<TextInput style={styles.input} value={profileLastName} onChangeText={setProfileLastName} placeholder="Last Name" />
						<TextInput style={styles.input} value={profileRadius} onChangeText={setProfileRadius} placeholder="Notification Radius (miles)" keyboardType="numeric" />
						<TextInput
							style={[styles.input, styles.addressInput]}
							value={profileHomeAddress}
							onChangeText={setProfileHomeAddress}
							placeholder="Home Address"
							multiline
							numberOfLines={3}
						/>

						<View style={styles.modalActions}>
							<Pressable style={styles.saveButton} onPress={handleSaveProfile} disabled={savingProfile}>
								<ThemedText style={styles.saveButtonText}>{savingProfile ? 'Saving...' : 'Save'}</ThemedText>
							</Pressable>
							<Pressable style={styles.cancelButton} onPress={handleCancelProfileSetup} disabled={savingProfile}>
								<ThemedText style={styles.cancelButtonText}>Dismiss</ThemedText>
							</Pressable>
						</View>
					</View>
				</View>
			</Modal>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
		backgroundColor: '#F4EADB',
	},
	container: {
		flex: 1,
		justifyContent: 'center',
		padding: 20,
	},
	card: {
		backgroundColor: '#FFF8ED',
		borderRadius: 16,
		padding: 20,
		borderWidth: 1,
		borderColor: '#D2BFA3',
	},
	title: {
		fontSize: 30,
		fontWeight: '700',
		color: '#6B3F26',
		marginBottom: 8,
	},
	subtitle: {
		fontSize: 14,
		color: '#7B6A58',
		marginBottom: 16,
	},
	input: {
		borderWidth: 1,
		borderColor: '#C8B79C',
		borderRadius: 10,
		backgroundColor: '#FFFFFF',
		paddingHorizontal: 12,
		paddingVertical: 10,
		marginBottom: 12,
	},
	primaryButton: {
		backgroundColor: '#3E7A56',
		borderRadius: 10,
		paddingVertical: 12,
		alignItems: 'center',
		marginTop: 4,
	},
	primaryText: {
		color: '#FFFFFF',
		fontWeight: '700',
		fontSize: 16,
	},
	secondaryButton: {
		marginTop: 10,
		borderWidth: 1,
		borderColor: '#6B3F26',
		borderRadius: 10,
		paddingVertical: 10,
		alignItems: 'center',
	},
	secondaryText: {
		color: '#6B3F26',
		fontWeight: '600',
	},
	linkButton: {
		marginTop: 14,
		alignItems: 'center',
	},
	linkText: {
		color: '#6B3F26',
		textDecorationLine: 'underline',
	},
	modalOverlay: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.6)',
		justifyContent: 'center',
		alignItems: 'center',
		padding: 20,
	},
	modalContent: {
		width: '100%',
		backgroundColor: '#fff',
		borderRadius: 12,
		padding: 20,
	},
	modalTitle: {
		fontSize: 20,
		fontWeight: 'bold',
		marginBottom: 12,
	},
	modalSubtitle: {
		fontSize: 14,
		color: '#7B6A58',
		marginBottom: 12,
	},
	modalActions: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginTop: 10,
	},
	addressInput: {
		height: 86,
		textAlignVertical: 'top',
	},
	saveButton: {
		backgroundColor: '#0076C0',
		padding: 10,
		borderRadius: 8,
		flex: 1,
		alignItems: 'center',
		marginRight: 5,
	},
	saveButtonText: {
		color: '#fff',
		fontWeight: 'bold',
	},
	cancelButton: {
		backgroundColor: '#999',
		padding: 10,
		borderRadius: 8,
		flex: 1,
		alignItems: 'center',
		marginLeft: 5,
	},
	cancelButtonText: {
		color: '#fff',
		fontWeight: 'bold',
	},
});
