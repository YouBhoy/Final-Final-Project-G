import java.nio.file.*;
import java.security.*;
import java.util.Base64;

// Disposable host TLS fixture only. Never compiled into the Android application.
public final class ExportTestTls {
  static String pem(String label, byte[] bytes) {
    return "-----BEGIN " + label + "-----\n" + Base64.getMimeEncoder(64, new byte[]{10}).encodeToString(bytes) + "\n-----END " + label + "-----\n";
  }
  public static void main(String[] args) throws Exception {
    KeyStore store=KeyStore.getInstance("PKCS12");
    try(var in=Files.newInputStream(Path.of(args[0]))) { store.load(in,"synthetic-local-only".toCharArray()); }
    Files.writeString(Path.of(args[1]+"-key.pem"),pem("PRIVATE KEY",store.getKey("local","synthetic-local-only".toCharArray()).getEncoded()));
    Files.writeString(Path.of(args[1]+"-cert.pem"),pem("CERTIFICATE",store.getCertificate("local").getEncoded()));
  }
}
