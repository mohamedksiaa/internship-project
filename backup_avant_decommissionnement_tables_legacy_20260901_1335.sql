/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19  Distrib 10.6.23-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: localhost    Database: dolibarr
-- ------------------------------------------------------
-- Server version	10.6.23-MariaDB-0ubuntu0.22.04.1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `llx_timeflow_project`
--

DROP TABLE IF EXISTS `llx_timeflow_project`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `llx_timeflow_project` (
  `rowid` int(11) NOT NULL AUTO_INCREMENT,
  `entity` int(11) NOT NULL DEFAULT 1,
  `ref` varchar(128) NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `source` varchar(20) NOT NULL DEFAULT 'manual',
  `fk_dolibarr_project` int(11) DEFAULT NULL,
  `fk_soc` int(11) DEFAULT NULL,
  `fk_user_creat` int(11) NOT NULL,
  `date_creation` datetime NOT NULL,
  `tms` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `import_key` varchar(14) DEFAULT NULL,
  PRIMARY KEY (`rowid`),
  KEY `idx_timeflow_project_entity` (`entity`),
  KEY `idx_timeflow_project_fk_soc` (`fk_soc`),
  KEY `idx_timeflow_project_source` (`source`),
  KEY `idx_timeflow_project_fk_dolibarr` (`fk_dolibarr_project`),
  KEY `idx_cfp_rowid` (`rowid`),
  KEY `idx_timeflow_project_rowid` (`rowid`)
) ENGINE=InnoDB AUTO_INCREMENT=53 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `llx_timeflow_project`
--

LOCK TABLES `llx_timeflow_project` WRITE;
/*!40000 ALTER TABLE `llx_timeflow_project` DISABLE KEYS */;
INSERT INTO `llx_timeflow_project` VALUES (47,1,'CPJ-20260831165012','test','','manual',NULL,1,1,'2026-08-31 16:50:12','2026-08-31 14:50:12',NULL),(48,1,'CPJ-20260831165044','test2026','','manual',NULL,1,1,'2026-08-31 16:50:44','2026-08-31 14:50:44',NULL),(49,1,'CPJ-20260901102207','AAAAA','','manual',NULL,1,1,'2026-09-01 10:22:07','2026-09-01 08:22:07',NULL),(50,1,'CPJ-20260901103741','NOUVEAU PROJET','','manual',NULL,1,1,'2026-09-01 10:37:41','2026-09-01 08:37:41',NULL),(51,1,'CPJ-20260901105126','nouveau projet','','manual',NULL,1,1,'2026-09-01 10:51:26','2026-09-01 08:51:26',NULL),(52,1,'CPJ-20260901113451','test - 02','','manual',NULL,1,1,'2026-09-01 11:34:51','2026-09-01 09:34:51',NULL);
/*!40000 ALTER TABLE `llx_timeflow_project` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `llx_timeflow_project_user`
--

DROP TABLE IF EXISTS `llx_timeflow_project_user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `llx_timeflow_project_user` (
  `rowid` int(11) NOT NULL AUTO_INCREMENT,
  `entity` int(11) NOT NULL DEFAULT 1,
  `fk_project` int(11) NOT NULL,
  `fk_user` int(11) NOT NULL,
  `date_creation` datetime NOT NULL,
  `fk_user_creat` int(11) NOT NULL,
  PRIMARY KEY (`rowid`),
  UNIQUE KEY `uk_timeflow_project_user` (`fk_project`,`fk_user`),
  KEY `idx_timeflow_project_user_entity` (`entity`),
  KEY `idx_timeflow_project_user_project` (`fk_project`),
  KEY `idx_timeflow_project_user_user` (`fk_user`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `llx_timeflow_project_user`
--

LOCK TABLES `llx_timeflow_project_user` WRITE;
/*!40000 ALTER TABLE `llx_timeflow_project_user` DISABLE KEYS */;
INSERT INTO `llx_timeflow_project_user` VALUES (2,1,7,2,'2026-09-01 10:51:39',1),(3,1,7,7,'2026-09-01 10:51:39',1),(4,1,7,11,'2026-09-01 10:51:39',1),(5,1,7,8,'2026-09-01 10:51:39',1),(6,1,7,14,'2026-09-01 10:51:39',1),(7,1,7,1,'2026-09-01 10:51:39',1),(8,1,7,10,'2026-09-01 10:51:39',1),(9,1,7,4,'2026-09-01 10:51:39',1),(10,1,7,15,'2026-09-01 10:51:39',1),(11,1,7,3,'2026-09-01 10:51:39',1),(12,1,7,5,'2026-09-01 10:51:39',1),(13,1,7,9,'2026-09-01 10:51:39',1),(14,1,8,2,'2026-09-01 11:34:51',1);
/*!40000 ALTER TABLE `llx_timeflow_project_user` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `llx_timeflow_migration_map`
--

DROP TABLE IF EXISTS `llx_timeflow_migration_map`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `llx_timeflow_migration_map` (
  `rowid` int(11) NOT NULL AUTO_INCREMENT,
  `old_rowid` int(11) NOT NULL,
  `new_rowid` int(11) NOT NULL,
  `method` varchar(32) NOT NULL,
  `date_creation` datetime NOT NULL,
  PRIMARY KEY (`rowid`),
  UNIQUE KEY `uk_timeflow_migration_map_old` (`old_rowid`),
  KEY `idx_timeflow_migration_map_new` (`new_rowid`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `llx_timeflow_migration_map`
--

LOCK TABLES `llx_timeflow_migration_map` WRITE;
/*!40000 ALTER TABLE `llx_timeflow_migration_map` DISABLE KEYS */;
INSERT INTO `llx_timeflow_migration_map` VALUES (1,47,3,'created','2026-09-01 11:27:09'),(2,48,4,'created','2026-09-01 11:27:09'),(3,49,5,'created','2026-09-01 11:27:09'),(4,50,6,'created','2026-09-01 11:27:09'),(5,51,7,'created','2026-09-01 11:27:09'),(6,52,8,'created','2026-09-01 11:41:08');
/*!40000 ALTER TABLE `llx_timeflow_migration_map` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-01 13:35:22
