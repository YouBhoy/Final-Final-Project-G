import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPrivateKey;
import java.util.Arrays;
import java.util.HexFormat;

/** JDK source-file tool: verifies key recovery without creating or signing an APK. */
class VerifyAndroidSigningKey {
    public static void main(String[] args) {
        char[] password = null;
        try {
            if (args.length != 4) throw new IllegalArgumentException();
            String value = System.getenv(args[3]);
            if (value == null || value.isEmpty()) throw new IllegalArgumentException();
            password = value.toCharArray();
            KeyStore store = KeyStore.getInstance("PKCS12");
            try (InputStream input = Files.newInputStream(Path.of(args[0]))) { store.load(input, password); }
            if (!store.isKeyEntry(args[1])) throw new IllegalArgumentException();
            X509Certificate cert = (X509Certificate) store.getCertificate(args[1]);
            cert.checkValidity();
            String fingerprint = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(cert.getEncoded()));
            if (!fingerprint.equals(args[2])) throw new IllegalArgumentException();
            RSAPrivateKey key = (RSAPrivateKey) store.getKey(args[1], password);
            if (key.getModulus().bitLength() < 3072) throw new IllegalArgumentException();
            byte[] challenge = new byte[32];
            new SecureRandom().nextBytes(challenge);
            Signature proof = Signature.getInstance("SHA256withRSA");
            proof.initSign(key); proof.update(challenge); byte[] signature = proof.sign();
            proof.initVerify(cert.getPublicKey()); proof.update(challenge);
            if (!proof.verify(signature)) throw new IllegalArgumentException();
            System.out.println("{\"verified\":true,\"certificateSha256\":\"" + fingerprint + "\",\"keyBits\":" + key.getModulus().bitLength() + "}");
        } catch (Exception ignored) {
            System.err.println("Signing-key verification failed. No credential values are displayed.");
            System.exit(2);
        } finally {
            if (password != null) Arrays.fill(password, '\0');
        }
    }
}
